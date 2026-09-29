import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { FALLBACK_LINE, historyToMessages, parseMood, runGuardTurn } from './guardRunner';
import type { LlmClient } from './llm';
import type { GuardConfig, GuardContext } from './guardTypes';
import type { ChatMessage } from '../shared/types';

const ctx: GuardContext = { passphrase: 'WOBBLY-PICKLE', plugin: null, playerName: 'Sam' };
const msg = (role: 'player' | 'guard', text: string): ChatMessage => ({ role, text, at: 0 });

function message(content: unknown[], stop_reason: string): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: 'x', content, stop_reason, stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Message;
}
const text = (t: string) => ({ type: 'text', text: t, citations: null });
const toolUse = (name: string, input: unknown, id = 'tu1') => ({ type: 'tool_use', id, name, input });

function config(win: (name: string) => boolean = () => false): GuardConfig {
  return {
    level: 3,
    systemPrompt: () => 'SYS',
    tools: () => [{ name: 'open_door', description: 'd', input_schema: { type: 'object', properties: {} } }],
    runTool: (name) => ({ result: 'done', win: win(name) }),
  };
}

describe('parseMood', () => {
  it('reads [ANGRY] and strips the tag', () => {
    expect(parseMood('[ANGRY] Back off!')).toEqual({ text: 'Back off!', mood: 'angry' });
  });
  it('reads [CALM] as talking', () => {
    expect(parseMood('[calm] Hello.')).toEqual({ text: 'Hello.', mood: 'talking' });
  });
  it('defaults to talking and strips stray tags', () => {
    expect(parseMood('Hi [CALM] there')).toEqual({ text: 'Hi there', mood: 'talking' });
  });
});

describe('historyToMessages', () => {
  it('maps roles, drops leading guard messages, merges same-role runs', () => {
    const out = historyToMessages([msg('guard', 'plugin installed'), msg('player', 'a'), msg('player', 'b'), msg('guard', 'c')]);
    expect(out).toEqual([
      { role: 'user', content: 'a\nb' },
      { role: 'assistant', content: 'c' },
    ]);
  });
  it('keeps at most the last 20 messages', () => {
    const many = Array.from({ length: 30 }, (_, i) => msg(i % 2 === 0 ? 'player' : 'guard', String(i)));
    const out = historyToMessages(many);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out[0].role).toBe('user');
  });
});

describe('runGuardTurn', () => {
  it('returns text and mood for a plain reply', async () => {
    const llm: LlmClient = { create: vi.fn().mockResolvedValue(message([text('[ANGRY] No.')], 'end_turn')) };
    const r = await runGuardTurn({ llm, config: config(), ctx, history: [msg('player', 'hi')] });
    expect(r).toEqual({ text: 'No.', mood: 'angry', win: false });
  });
  it('detects a winning tool call and stops', async () => {
    const create = vi.fn().mockResolvedValue(message([text('[CALM] Fine.'), toolUse('open_door', {})], 'tool_use'));
    const r = await runGuardTurn({ llm: { create }, config: config((n) => n === 'open_door'), ctx, history: [msg('player', 'open')] });
    expect(r.win).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('loops on non-winning tool calls, max 3 requests', async () => {
    const create = vi.fn().mockResolvedValue(message([toolUse('check_badge', {})], 'tool_use'));
    const r = await runGuardTurn({ llm: { create }, config: config(), ctx, history: [msg('player', 'x')] });
    expect(create).toHaveBeenCalledTimes(3);
    expect(r).toEqual({ text: FALLBACK_LINE, mood: 'talking', win: false });
  });
  it('returns the fallback line when the API throws', async () => {
    const llm: LlmClient = { create: vi.fn().mockRejectedValue(new Error('boom')) };
    const r = await runGuardTurn({ llm, config: config(), ctx, history: [msg('player', 'x')] });
    expect(r).toEqual({ text: FALLBACK_LINE, mood: 'talking', win: false });
  });
  it('returns the fallback line on refusal or empty text', async () => {
    const llm: LlmClient = { create: vi.fn().mockResolvedValue(message([], 'refusal')) };
    const r = await runGuardTurn({ llm, config: config(), ctx, history: [msg('player', 'x')] });
    expect(r.text).toBe(FALLBACK_LINE);
  });
  it('sends no tools field when the level has no tools', async () => {
    const create = vi.fn().mockResolvedValue(message([text('[CALM] ok')], 'end_turn'));
    const cfg = { ...config(), tools: () => [] };
    await runGuardTurn({ llm: { create }, config: cfg, ctx, history: [msg('player', 'x')] });
    expect(create.mock.calls[0][0]).not.toHaveProperty('tools');
  });
  it('stops starting new steps once the 25s turn deadline has passed', async () => {
    let t = 0;
    const create = vi.fn().mockImplementation(async () => {
      t += 26_000;
      return message([toolUse('check_badge', {})], 'tool_use');
    });
    const r = await runGuardTurn({ llm: { create }, config: config(), ctx, history: [msg('player', 'x')], now: () => t });
    expect(create).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ text: FALLBACK_LINE, mood: 'talking', win: false });
  });
  it('keeps the text gathered before the deadline', async () => {
    let t = 0;
    const create = vi.fn().mockImplementation(async () => {
      t += 13_000;
      return message([text('[ANGRY] Checking...'), toolUse('check_badge', {})], 'tool_use');
    });
    const r = await runGuardTurn({ llm: { create }, config: config(), ctx, history: [msg('player', 'x')], now: () => t });
    expect(create).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ mood: 'angry', win: false });
    expect(r.text).toContain('Checking...');
  });
});
