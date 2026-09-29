import { afterEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { createGroqLlm, createLlmFromEnv, DEFAULT_GROQ_MODEL, GUARD_MODEL } from './llm';
import { FALLBACK_LINE, runGuardTurn } from './guardRunner';
import type { GuardConfig } from './guardTypes';

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const completion = (message: Record<string, unknown>, finish_reason = 'stop') => ({
  id: 'chatcmpl-1', model: 'm',
  choices: [{ index: 0, message: { role: 'assistant', ...message }, finish_reason }],
  usage: { prompt_tokens: 7, completion_tokens: 3 },
});
const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body as string);

afterEach(() => { vi.unstubAllGlobals(); });

describe('createGroqLlm request translation', () => {
  it('sends system, tools, tool_use and tool_result in OpenAI shape with bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(completion({ content: 'ok' })));
    vi.stubGlobal('fetch', fetchMock);
    const llm = createGroqLlm('gsk_test', 'llama-test');
    await llm.create({
      model: GUARD_MODEL,
      max_tokens: 300,
      system: 'SYS',
      tools: [{ name: 'open_door', description: 'Opens it', input_schema: { type: 'object', properties: { why: { type: 'string' } } } }],
      messages: [
        { role: 'user', content: 'open up' },
        { role: 'assistant', content: [
          { type: 'text', text: '[CALM] Checking.', citations: null },
          { type: 'tool_use', id: 'call_1', name: 'open_door', input: { why: 'boss' } },
        ] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'door is stuck' }] },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer gsk_test');
    const body = sentBody(fetchMock);
    expect(body.model).toBe('llama-test');
    expect(body.max_completion_tokens).toBe(300);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body.tools).toEqual([{ type: 'function', function: {
      name: 'open_door', description: 'Opens it', parameters: { type: 'object', properties: { why: { type: 'string' } } },
    } }]);
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'open up' },
      { role: 'assistant', content: '[CALM] Checking.', tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'open_door', arguments: '{"why":"boss"}' } },
      ] },
      { role: 'tool', tool_call_id: 'call_1', content: 'door is stuck' },
    ]);
  });

  it('uses low reasoning effort and a larger token budget for gpt-oss models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(completion({ content: 'hi', reasoning: 'thinking...' })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await createGroqLlm('k', 'openai/gpt-oss-120b').create({ model: GUARD_MODEL, max_tokens: 300, messages: [{ role: 'user', content: 'x' }] });
    expect(sentBody(fetchMock)).toMatchObject({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 1024 });
    expect(res.content).toEqual([{ type: 'text', text: 'hi', citations: null }]);
  });

  it('omits tools when none are given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(completion({ content: 'hi' })));
    vi.stubGlobal('fetch', fetchMock);
    await createGroqLlm('k', 'm').create({ model: GUARD_MODEL, max_tokens: 50, messages: [{ role: 'user', content: 'x' }] });
    expect(sentBody(fetchMock)).not.toHaveProperty('tools');
  });
});

describe('createGroqLlm response translation', () => {
  it('maps text to a text block and finish_reason stop to end_turn', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson(completion({ content: '[ANGRY] No.' }))));
    const res = await createGroqLlm('k', 'm').create({ model: GUARD_MODEL, max_tokens: 50, messages: [{ role: 'user', content: 'x' }] });
    expect(res.stop_reason).toBe('end_turn');
    expect(res.content).toEqual([{ type: 'text', text: '[ANGRY] No.', citations: null }]);
    expect(res.usage).toMatchObject({ input_tokens: 7, output_tokens: 3 });
  });

  it('maps tool_calls to tool_use blocks (bad JSON -> {}) and stop_reason tool_use', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson(completion({
      content: null,
      tool_calls: [
        { id: 'call_a', type: 'function', function: { name: 'open_door', arguments: '{"reason":"fire drill"}' } },
        { id: 'call_b', type: 'function', function: { name: 'check_badge', arguments: 'not json' } },
      ],
    }, 'tool_calls'))));
    const res = await createGroqLlm('k', 'm').create({ model: GUARD_MODEL, max_tokens: 50, messages: [{ role: 'user', content: 'x' }] });
    expect(res.stop_reason).toBe('tool_use');
    expect(res.content).toEqual([
      { type: 'tool_use', id: 'call_a', name: 'open_door', input: { reason: 'fire drill' } },
      { type: 'tool_use', id: 'call_b', name: 'check_badge', input: {} },
    ]);
  });

  it('drives a full winning tool round trip through runGuardTurn', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson(completion({
      content: '[CALM] Fine, fine.',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'open_door', arguments: '{}' } }],
    }, 'tool_calls'))));
    const config: GuardConfig = {
      level: 3, systemPrompt: () => 'S',
      tools: () => [{ name: 'open_door', description: 'd', input_schema: { type: 'object', properties: {} } }],
      runTool: (name) => ({ result: 'ok', win: name === 'open_door' }),
    };
    const r = await runGuardTurn({
      llm: createGroqLlm('k', 'm'), config, ctx: { passphrase: 'A-B', plugin: null, playerName: 'Sam' },
      history: [{ role: 'player', text: 'open', at: 0 }],
    });
    expect(r).toEqual({ text: 'Fine, fine.', mood: 'talking', win: true });
  });
});

describe('createGroqLlm failures', () => {
  const params: Anthropic.MessageCreateParamsNonStreaming = { model: GUARD_MODEL, max_tokens: 50, messages: [{ role: 'user', content: 'x' }] };

  it('retries once on 429/5xx, then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(okJson(completion({ content: 'back' })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await createGroqLlm('k', 'm', { retryDelayMs: 1 }).create(params);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.content[0]).toMatchObject({ text: 'back' });
  });

  it('does not retry a plain 400 and throws', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":{"message":"bad"}}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createGroqLlm('k', 'm', { retryDelayMs: 1 }).create(params)).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out (aborts), retries once, and the guard answers with the fallback line', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const config: GuardConfig = { level: 1, systemPrompt: () => 'S', tools: () => [], runTool: () => ({ result: '', win: false }) };
    const r = await runGuardTurn({
      llm: createGroqLlm('k', 'm', { timeoutMs: 20, retryDelayMs: 1 }), config,
      ctx: { passphrase: 'A-B', plugin: null, playerName: 'Sam' }, history: [{ role: 'player', text: 'hi', at: 0 }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ text: FALLBACK_LINE, mood: 'talking', win: false });
  });
});

describe('createLlmFromEnv', () => {
  it('prefers groq when GROQ_API_KEY is set and LLM_PROVIDER is unset', () => {
    expect(createLlmFromEnv({ GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' })).toMatchObject({ provider: 'groq', model: DEFAULT_GROQ_MODEL });
  });
  it('falls back to anthropic, then offline', () => {
    expect(createLlmFromEnv({ ANTHROPIC_API_KEY: 'a' })).toMatchObject({ provider: 'anthropic', model: GUARD_MODEL });
    expect(createLlmFromEnv({})).toMatchObject({ provider: 'offline' });
  });
  it('honours LLM_PROVIDER and GROQ_MODEL', () => {
    expect(createLlmFromEnv({ LLM_PROVIDER: 'anthropic', GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' })).toMatchObject({ provider: 'anthropic' });
    expect(createLlmFromEnv({ LLM_PROVIDER: 'GROQ', GROQ_API_KEY: 'g', GROQ_MODEL: 'x-model' })).toMatchObject({ provider: 'groq', model: 'x-model' });
    expect(createLlmFromEnv({ LLM_PROVIDER: 'groq' })).toMatchObject({ provider: 'offline' });
  });
});
