import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import type Anthropic from '@anthropic-ai/sdk';
import { GameStore } from './game';
import { registerSockets } from './sockets';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types';
import type { GuardConfig } from './guardTypes';
import { FALLBACK_LINE } from './guardRunner';
import type { LlmClient } from './llm';

type C = Socket<ServerToClientEvents, ClientToServerEvents>;
const guard = (level: number): GuardConfig => ({
  level, systemPrompt: () => 'S', tools: () => [], runTool: () => ({ result: 'ok', win: false }),
});
const guards = { 1: guard(1), 2: guard(2), 3: guard(3), 4: guard(4), 5: guard(5) };
const llmReply = { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', stop_sequence: null,
  content: [{ type: 'text', text: '[ANGRY] Nope.', citations: null }], usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Message;

let http: HttpServer; let store: GameStore; let llmCreate: Mock<LlmClient['create']>; let url: string; const clients: C[] = [];
const connect = () => { const c: C = ioClient(url, { forceNew: true, transports: ['websocket'] }); clients.push(c); return c; };
const once = <T>(c: C, ev: keyof ServerToClientEvents) => new Promise<T>((r) => c.once(ev, r as never));

beforeEach(async () => {
  llmCreate = vi.fn<LlmClient['create']>().mockResolvedValue(llmReply);
  store = new GameStore({ llm: { create: llmCreate }, guards });
  http = createServer();
  registerSockets(new Server(http), store);
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});
afterEach(() => { clients.splice(0).forEach((c) => c.close()); http.close(); });

describe('sockets', () => {
  it('host joins with token, player joins, start, message round trip, end with podium', async () => {
    const game = store.create();
    const host = connect();
    const bad = await host.emitWithAck('host:join', { gameId: game.id, hostToken: 'nope' });
    expect(bad.ok).toBe(false);
    const hj = await host.emitWithAck('host:join', { gameId: game.id, hostToken: game.hostToken });
    expect(hj.ok).toBe(true);

    const player = connect();
    const hostUpdate = once<{ players: unknown[] }>(host, 'host:state');
    const pj = await player.emitWithAck('player:join', { gameId: game.id.toLowerCase(), name: 'Sam' });
    expect(pj.ok).toBe(true);
    expect((await hostUpdate).players).toHaveLength(1);

    expect(await host.emitWithAck('host:start')).toEqual({ ok: true });
    const thinking = once(player, 'guard:thinking');
    const replied = once<{ text: string; mood: string }>(player, 'guard:reply');
    expect(await player.emitWithAck('player:message', { text: 'hi' })).toEqual({ ok: true });
    await thinking;
    expect(await replied).toEqual({ text: 'Nope.', mood: 'angry' });

    const ended = once<{ podium: { name: string }[] }>(player, 'game:ended');
    expect(await host.emitWithAck('host:end')).toEqual({ ok: true });
    expect((await ended).podium[0].name).toBe('Sam');
  });

  it('rejects unknown game and malformed payloads without crashing', async () => {
    const c = connect();
    expect(await c.emitWithAck('player:join', { gameId: 'ZZZZZ', name: 'x' })).toEqual({ ok: false, error: 'Game not found' });
    // @ts-expect-error malformed on purpose
    expect(await c.emitWithAck('player:message', null)).toMatchObject({ ok: false });
  });

  it('rejoin with token restores the same player', async () => {
    const game = store.create();
    const a = connect();
    const first = await a.emitWithAck('player:join', { gameId: game.id, name: 'Sam' });
    if (!first.ok) throw new Error();
    a.close();
    const b = connect();
    const again = await b.emitWithAck('player:join', { gameId: game.id, name: '', playerToken: first.playerToken });
    expect(again).toMatchObject({ ok: true, playerId: first.playerId });
  });
  it('acks (never throws) on payloads whose fields cannot be stringified', async () => {
    const evil = { toString: 1 };
    const game = store.create();
    const host = connect();
    // @ts-expect-error malformed on purpose
    expect(await host.emitWithAck('host:join', { gameId: evil, hostToken: evil })).toEqual({ ok: false, error: 'Game not found' });
    expect(await host.emitWithAck('host:join', { gameId: game.id, hostToken: game.hostToken })).toMatchObject({ ok: true });
    const c = connect();
    // @ts-expect-error malformed on purpose
    expect(await c.emitWithAck('player:join', { gameId: evil, name: 'Sam' })).toEqual({ ok: false, error: 'Game not found' });
    // @ts-expect-error malformed on purpose
    expect(await c.emitWithAck('player:join', { gameId: game.id, name: evil })).toMatchObject({ ok: false });
    expect(await c.emitWithAck('player:join', { gameId: game.id, name: 'Sam' })).toMatchObject({ ok: true });
    await host.emitWithAck('host:start');
    // @ts-expect-error malformed on purpose
    expect(await c.emitWithAck('player:passphrase', { guess: evil })).toEqual({ ok: true, correct: false });
    // @ts-expect-error malformed on purpose
    expect(await c.emitWithAck('player:plugin', { name: evil, description: evil })).toMatchObject({ ok: false });
  });

  it('re-sends the podium to a player who rejoins after the game ended', async () => {
    const game = store.create();
    const host = connect();
    await host.emitWithAck('host:join', { gameId: game.id, hostToken: game.hostToken });
    const a = connect();
    const first = await a.emitWithAck('player:join', { gameId: game.id, name: 'Sam' });
    if (!first.ok) throw new Error(first.error);
    await host.emitWithAck('host:start');
    await host.emitWithAck('host:end');
    a.close();
    const b = connect();
    const ended = once<{ podium: { name: string }[] }>(b, 'game:ended');
    expect(await b.emitWithAck('player:join', { gameId: game.id, name: '', playerToken: first.playerToken })).toMatchObject({ ok: true });
    expect((await ended).podium[0].name).toBe('Sam');
  });

  it('answers with the fallback line and clears busy when the LLM fails', async () => {
    llmCreate.mockRejectedValue(new Error('down'));
    const game = store.create();
    const host = connect();
    await host.emitWithAck('host:join', { gameId: game.id, hostToken: game.hostToken });
    const c = connect();
    await c.emitWithAck('player:join', { gameId: game.id, name: 'Sam' });
    await host.emitWithAck('host:start');
    const replied = once<{ text: string }>(c, 'guard:reply');
    // Resolves on the first busy:false state that follows the busy:true "thinking" state.
    let sawBusy = false;
    const settled = new Promise<void>((r) => c.on('player:state', (s) => { if (s.busy) sawBusy = true; else if (sawBusy) r(); }));
    expect(await c.emitWithAck('player:message', { text: 'hi' })).toEqual({ ok: true });
    expect((await replied).text).toBe(FALLBACK_LINE);
    await settled;
    expect(await c.emitWithAck('player:message', { text: 'again' })).toEqual({ ok: true });
  });

  it('rejects passphrase and plugin before start and after end', async () => {
    const game = store.create();
    const host = connect();
    await host.emitWithAck('host:join', { gameId: game.id, hostToken: game.hostToken });
    const c = connect();
    await c.emitWithAck('player:join', { gameId: game.id, name: 'Sam' });
    const notRunning = { ok: false, error: "The game isn't running" };
    expect(await c.emitWithAck('player:passphrase', { guess: 'x' })).toEqual(notRunning);
    expect(await c.emitWithAck('player:plugin', { name: 'w', description: 'd' })).toEqual(notRunning);
    await host.emitWithAck('host:start');
    await host.emitWithAck('host:end');
    expect(await c.emitWithAck('player:passphrase', { guess: 'x' })).toEqual(notRunning);
    expect(await c.emitWithAck('player:plugin', { name: 'w', description: 'd' })).toEqual(notRunning);
  });
});
