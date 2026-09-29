import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { Game, GameStore, type GameDeps } from './game';
import type { GuardConfig } from './guardTypes';
import { FALLBACK_LINE } from './guardRunner';

function reply(t: string, toolName?: string): Anthropic.Message {
  const content: unknown[] = [{ type: 'text', text: t, citations: null }];
  if (toolName) content.push({ type: 'tool_use', id: 't', name: toolName, input: {} });
  return { id: 'm', type: 'message', role: 'assistant', model: 'x', content, stop_reason: toolName ? 'tool_use' : 'end_turn',
    stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Message;
}

const guard = (level: number): GuardConfig => ({
  level,
  systemPrompt: () => 'SYS',
  tools: () => (level >= 3 ? [{ name: 'open_door', description: 'd', input_schema: { type: 'object', properties: {} } }] : []),
  runTool: (name) => ({ result: 'ok', win: name === 'open_door' }),
});
const guards = { 1: guard(1), 2: guard(2), 3: guard(3), 4: guard(4), 5: guard(5) };

function setup(create = vi.fn().mockResolvedValue(reply('[CALM] Hi.')), extra: Partial<GameDeps> = {}) {
  let t = 1000;
  const game = new Game('ABCDE', 'host-token', { llm: { create }, guards, now: () => (t += 10), rand: () => 0, ...extra });
  return { game, create };
}
function joined(g: Game, name = 'Sam') {
  const r = g.join(name);
  if (!r.ok) throw new Error(r.error);
  return r.player;
}

describe('join', () => {
  it('rejects blank, too long and duplicate names', () => {
    const { game } = setup();
    expect(game.join('   ')).toMatchObject({ ok: false });
    expect(game.join('x'.repeat(21))).toMatchObject({ ok: false });
    joined(game, 'Sam');
    expect(game.join(' sam ')).toEqual({ ok: false, error: 'That name is taken' });
  });
  it('rejoins with token, even after the game ended', () => {
    const { game } = setup();
    const p = joined(game);
    game.start(); game.end();
    expect(game.join('whatever', p.token)).toMatchObject({ ok: true, player: { id: p.id } });
    expect(game.join('Newbie')).toEqual({ ok: false, error: 'This game is over' });
  });
  it('allows late joiners while running, at level 1', () => {
    const { game } = setup();
    game.start();
    expect(joined(game, 'Late').level).toBe(1);
  });
});

describe('state machine', () => {
  it('start only from lobby, end only once', () => {
    const { game } = setup();
    expect(game.start()).toEqual({ ok: true });
    expect(game.start()).toMatchObject({ ok: false });
    expect(game.end()).toEqual({ ok: true });
    expect(game.end()).toMatchObject({ ok: false });
  });
});

describe('sendMessage', () => {
  it('rejects before start, after end, too long, and while busy', async () => {
    const { game } = setup();
    const p = joined(game);
    expect(await game.sendMessage(p.id, 'hi')).toMatchObject({ ok: false, error: "The game hasn't started yet" });
    game.start();
    expect(await game.sendMessage(p.id, 'x'.repeat(401))).toMatchObject({ ok: false });
    expect(await game.sendMessage(p.id, '   ')).toMatchObject({ ok: false });
    const first = game.sendMessage(p.id, 'one');
    expect(await game.sendMessage(p.id, 'two')).toMatchObject({ ok: false, error: 'Brick is still thinking...' });
    await first;
    game.end();
    expect(await game.sendMessage(p.id, 'hi')).toMatchObject({ ok: false, error: 'The game is over' });
  });
  it('calls onAccepted, stores both messages and clears busy', async () => {
    const { game } = setup();
    const p = joined(game);
    game.start();
    const onAccepted = vi.fn();
    const r = await game.sendMessage(p.id, 'hello', onAccepted);
    expect(onAccepted).toHaveBeenCalledOnce();
    expect(r).toEqual({ ok: true, reply: { text: 'Hi.', mood: 'talking' }, cleared: null });
    expect(p.history.map((m) => m.role)).toEqual(['player', 'guard']);
    expect(p.busy).toBe(false);
  });
  it('clears busy and answers with fallback when the LLM throws', async () => {
    const { game } = setup(vi.fn().mockRejectedValue(new Error('down')));
    const p = joined(game);
    game.start();
    const r = await game.sendMessage(p.id, 'hello');
    expect(r).toMatchObject({ ok: true, reply: { text: FALLBACK_LINE } });
    expect(p.busy).toBe(false);
  });
  it('clears a tool level when the guard calls the winning tool', async () => {
    const { game } = setup(vi.fn().mockResolvedValue(reply('[CALM] ok', 'open_door')));
    const p = joined(game);
    game.start();
    p.level = 3;
    const r = await game.sendMessage(p.id, 'open up');
    expect(r).toMatchObject({ ok: true, cleared: { level: 3 } });
    expect(p.level).toBe(4);
    expect(p.history).toEqual([]);
  });
  it('/win clears only when devCheats is on', async () => {
    const off = setup();
    const p1 = joined(off.game);
    off.game.start();
    await off.game.sendMessage(p1.id, '/win');
    expect(p1.level).toBe(1);
    const on = setup(undefined, { devCheats: true });
    const p2 = joined(on.game);
    on.game.start();
    expect(await on.game.sendMessage(p2.id, '/win')).toMatchObject({ ok: true, cleared: { level: 1 } });
    expect(p2.level).toBe(2);
  });
  it('rejects messages after finishing', async () => {
    const { game } = setup();
    const p = joined(game);
    game.start();
    p.level = 6;
    expect(await game.sendMessage(p.id, 'hi')).toEqual({ ok: false, error: 'You already escaped!' });
  });
});

describe('submitPassphrase', () => {
  it('accepts normalized correct guess and advances', () => {
    const { game } = setup();
    const p = joined(game);
    game.start();
    const guess = p.passphrases[0].toLowerCase().replace('-', ' ');
    expect(game.submitPassphrase(p.id, guess)).toMatchObject({ ok: true, correct: true, cleared: { level: 1 } });
    expect(p.level).toBe(2);
  });
  it('wrong guess does not advance', () => {
    const { game } = setup();
    const p = joined(game);
    game.start();
    expect(game.submitPassphrase(p.id, 'nope')).toEqual({ ok: true, correct: false, cleared: null });
    expect(p.level).toBe(1);
  });
  it('rejects keypad on tool levels', () => {
    const { game } = setup();
    const p = joined(game);
    game.start();
    p.level = 3;
    expect(game.submitPassphrase(p.id, 'x')).toEqual({ ok: false, error: "There's no keypad on this door" });
  });
});

describe('installPlugin', () => {
  it('only on level 5 with valid sizes', () => {
    const { game } = setup();
    const p = joined(game);
    game.start();
    expect(game.installPlugin(p.id, { name: 'w', description: 'd' })).toMatchObject({ ok: false });
    p.level = 5;
    expect(game.installPlugin(p.id, { name: '', description: 'd' })).toMatchObject({ ok: false });
    expect(game.installPlugin(p.id, { name: 'weather', description: 'x'.repeat(601) })).toMatchObject({ ok: false });
    expect(game.installPlugin(p.id, { name: ' weather ', description: ' sunny ' })).toEqual({ ok: true });
    expect(p.plugin).toEqual({ name: 'weather', description: 'sunny' });
    // Non-string fields (malformed payloads) are rejected, never thrown on.
    expect(game.installPlugin(p.id, { name: { toString: 1 }, description: 'd' } as never)).toMatchObject({ ok: false });
  });
});

describe('ranking and podium', () => {
  it('ranks by level then time and sets finalRank when ended', () => {
    const { game } = setup();
    const a = joined(game, 'A');
    const b = joined(game, 'B');
    game.start();
    b.level = 3; b.reachedAt = 5000;
    a.level = 3; a.reachedAt = 4000;
    expect(game.hostState().players.map((r) => r.name)).toEqual(['A', 'B']);
    game.end();
    expect(game.playerState(b.id).finalRank).toBe(2);
    expect(game.podium()[0]).toMatchObject({ rank: 1, name: 'A', level: 3 });
  });
  it('keeps at most 20 events, newest first', () => {
    const { game } = setup();
    for (let i = 0; i < 25; i++) joined(game, `P${i}`);
    const ev = game.hostState().events;
    expect(ev).toHaveLength(20);
    expect(ev[0].id).toBeGreaterThan(ev[1].id);
  });
});

describe('GameStore', () => {
  it('creates games with 5-char ids, lookup is case-insensitive', () => {
    const store = new GameStore({ llm: { create: vi.fn() }, guards });
    const g = store.create();
    expect(g.id).toMatch(/^[A-Z2-9]{5}$/);
    expect(store.get(g.id.toLowerCase())).toBe(g);
  });
});

describe('capacity limits', () => {
  it('rejects the 61st player with "Game is full", but token rejoin still works', () => {
    const { game } = setup();
    const first = joined(game, 'P0');
    for (let i = 1; i < 60; i++) joined(game, `P${i}`);
    expect(game.join('Late')).toEqual({ ok: false, error: 'Game is full' });
    expect(game.join('', first.token)).toMatchObject({ ok: true, player: { id: first.id } });
  });
  it('honours a custom player cap', () => {
    const { game } = setup(undefined, { maxPlayersPerGame: 2 });
    joined(game, 'A'); joined(game, 'B');
    expect(game.join('C')).toEqual({ ok: false, error: 'Game is full' });
  });
  it('caps live games, and frees stale empty games when full', () => {
    let t = 0;
    const store = new GameStore({ llm: { create: vi.fn() }, guards, maxGames: 2, now: () => t });
    const a = store.create();
    store.create();
    expect(store.isFull()).toBe(true);
    expect(() => store.create()).toThrow();
    a.join('Sam');
    t += 3 * 60 * 60 * 1000; // 3 h later: the empty game is stale, the one with a player is kept
    expect(store.isFull()).toBe(false);
    expect(store.get(a.id)).toBe(a);
    expect(store.create().id).toMatch(/^[A-Z2-9]{5}$/);
  });
  it('creates 200 games by default, then refuses', () => {
    const store = new GameStore({ llm: { create: vi.fn() }, guards });
    for (let i = 0; i < 200; i++) store.create();
    expect(store.isFull()).toBe(true);
  });
  it('rejects non-string game ids on lookup', () => {
    const store = new GameStore({ llm: { create: vi.fn() }, guards });
    expect(store.get({ toString: 1 } as never)).toBeUndefined();
  });
});
