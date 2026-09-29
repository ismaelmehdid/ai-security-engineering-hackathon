import Anthropic from '@anthropic-ai/sdk';

export const GUARD_MODEL = 'claude-haiku-4-5';

export interface LlmClient {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}

export function createAnthropicLlm(apiKey: string): LlmClient {
  // baseURL is explicit on purpose: the dev shell sets ANTHROPIC_BASE_URL to something else.
  const client = new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com', timeout: 12_000, maxRetries: 1 });
  return { create: (params) => client.messages.create(params) };
}

export function createOfflineLlm(): LlmClient {
  return {
    async create() {
      return {
        id: 'offline',
        type: 'message',
        role: 'assistant',
        model: GUARD_MODEL,
        content: [{ type: 'text', text: "[CALM] *flexes* My brain is offline. Tell the host to add a GROQ_API_KEY or ANTHROPIC_API_KEY.", citations: null }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      } as unknown as Anthropic.Message;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Groq (GroqCloud, OpenAI-compatible chat completions). Translates Anthropic-shaped params and
// responses so runGuardTurn works unchanged.
// ---------------------------------------------------------------------------------------------

/**
 * Production Groq model with tool calling, ~500 tok/s. (llama-3.3-70b-versatile is not enabled
 * for our key: the /models endpoint only lists gpt-oss for chat.) Override with GROQ_MODEL.
 */
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
/** gpt-oss models reason before answering; reasoning tokens count against the completion cap. */
const isReasoningModel = (model: string) => /gpt-oss/i.test(model);
const REASONING_MIN_TOKENS = 1024;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

type OpenAiToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

function blocksToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((b) => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : ''))
    .filter(Boolean)
    .join('\n');
}

export function toOpenAiMessages(params: Anthropic.MessageCreateParamsNonStreaming): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  const system = blocksToText(params.system);
  if (system) out.push({ role: 'system', content: system });
  for (const m of params.messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content } as OpenAiMessage);
      continue;
    }
    const blocks = m.content as unknown as Array<Record<string, unknown>>;
    if (m.role === 'assistant') {
      const text = blocksToText(blocks);
      const toolCalls: OpenAiToolCall[] = blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          id: String(b.id),
          type: 'function' as const,
          function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) },
        }));
      out.push(toolCalls.length > 0 ? { role: 'assistant', content: text || null, tool_calls: toolCalls } : { role: 'assistant', content: text });
    } else {
      // Tool results must directly follow the assistant tool_calls, so emit them first.
      for (const b of blocks) {
        if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: String(b.tool_use_id), content: blocksToText(b.content) });
      }
      const text = blocksToText(blocks);
      if (text) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface GroqCompletion {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: unknown; tool_calls?: Array<{ id?: unknown; function?: { name?: unknown; arguments?: unknown } }> }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function fromOpenAiCompletion(data: GroqCompletion, model: string): Anthropic.Message {
  const choice = data.choices?.[0];
  const msg = choice?.message;
  const content: unknown[] = [];
  if (typeof msg?.content === 'string' && msg.content.trim()) content.push({ type: 'text', text: msg.content, citations: null });
  const calls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
  calls.forEach((tc, i) => {
    const name = typeof tc?.function?.name === 'string' ? tc.function.name : '';
    if (!name) return;
    content.push({ type: 'tool_use', id: typeof tc.id === 'string' && tc.id ? tc.id : `call_${i}`, name, input: parseArgs(tc.function?.arguments) });
  });
  const hasToolUse = content.some((b) => (b as { type: string }).type === 'tool_use');
  const stop = choice?.finish_reason === 'tool_calls' || hasToolUse ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
  return {
    id: data.id ?? 'groq', type: 'message', role: 'assistant', model: data.model ?? model,
    content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
  } as unknown as Anthropic.Message;
}

class RetryableError extends Error {}

export function createGroqLlm(
  apiKey: string,
  model: string = DEFAULT_GROQ_MODEL,
  opts: { timeoutMs?: number; retryDelayMs?: number } = {},
): LlmClient {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const retryDelayMs = opts.retryDelayMs ?? 500;

  async function attempt(body: string): Promise<GroqCompletion> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      // Network error or timeout abort.
      throw new RetryableError(`Groq request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return (await res.json()) as GroqCompletion;
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    const msg = `Groq HTTP ${res.status}: ${detail}`;
    // 400 tool_use_failed = the model produced a malformed tool call; a second sample usually works.
    if (res.status === 429 || res.status >= 500 || (res.status === 400 && detail.includes('tool_use_failed'))) {
      throw new RetryableError(msg);
    }
    throw new Error(msg);
  }

  return {
    async create(params) {
      const tools = (params.tools ?? []) as Anthropic.Tool[];
      const body = JSON.stringify({
        model,
        messages: toOpenAiMessages(params),
        max_completion_tokens: isReasoningModel(model) ? Math.max(params.max_tokens, REASONING_MIN_TOKENS) : params.max_tokens,
        ...(isReasoningModel(model) ? { reasoning_effort: 'low' } : {}),
        ...(tools.length > 0
          ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description ?? '', parameters: t.input_schema } })) }
          : {}),
      });
      let data: GroqCompletion;
      try {
        data = await attempt(body);
      } catch (err) {
        if (!(err instanceof RetryableError)) throw err;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        data = await attempt(body);
      }
      return fromOpenAiCompletion(data, model);
    },
  };
}

export type LlmProvider = 'groq' | 'anthropic' | 'offline';

/**
 * Picks the LLM from env. LLM_PROVIDER=groq|anthropic forces a provider; otherwise Groq when
 * GROQ_API_KEY is set, else Anthropic when ANTHROPIC_API_KEY is set, else offline.
 */
export function createLlmFromEnv(env: Record<string, string | undefined> = process.env): {
  llm: LlmClient; provider: LlmProvider; model: string;
} {
  const groqKey = env.GROQ_API_KEY?.trim();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const groqModel = env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  const wanted = env.LLM_PROVIDER?.trim().toLowerCase() || '';
  const groq = () => ({ llm: createGroqLlm(groqKey!, groqModel), provider: 'groq' as const, model: groqModel });
  const anthropic = () => ({ llm: createAnthropicLlm(anthropicKey!), provider: 'anthropic' as const, model: GUARD_MODEL });
  const offline = () => ({ llm: createOfflineLlm(), provider: 'offline' as const, model: 'none' });
  if (wanted === 'groq') return groqKey ? groq() : offline();
  if (wanted === 'anthropic') return anthropicKey ? anthropic() : offline();
  if (groqKey) return groq();
  if (anthropicKey) return anthropic();
  return offline();
}
