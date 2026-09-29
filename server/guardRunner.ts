import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, GuardMood } from '../shared/types';
import type { GuardConfig, GuardContext } from './guardTypes';
import { GUARD_MODEL, type LlmClient } from './llm';

export const FALLBACK_LINE = '*flexes in confusion* ...say that again, tiny human?';
const MAX_HISTORY_MESSAGES = 20;
const MAX_STEPS = 3;
/** No new model request starts once a turn has run this long (keeps 'thinking' short). */
const TURN_DEADLINE_MS = 25_000;

export interface GuardTurnResult {
  text: string;
  mood: GuardMood;
  win: boolean;
}

export function parseMood(raw: string): { text: string; mood: GuardMood } {
  const lead = raw.match(/^\s*\[(ANGRY|CALM)\]/i);
  const mood: GuardMood = lead && lead[1].toUpperCase() === 'ANGRY' ? 'angry' : 'talking';
  const text = raw.replace(/\[(ANGRY|CALM)\]/gi, '').replace(/[ \t]{2,}/g, ' ').trim();
  return { text, mood };
}

export function historyToMessages(history: ChatMessage[]): Anthropic.MessageParam[] {
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  const start = recent.findIndex((m) => m.role === 'player');
  if (start === -1) return [];
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of recent.slice(start)) {
    const role = m.role === 'player' ? 'user' : 'assistant';
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${m.text}`;
    else out.push({ role, content: m.text });
  }
  return out;
}

export async function runGuardTurn(args: {
  llm: LlmClient;
  config: GuardConfig;
  ctx: GuardContext;
  history: ChatMessage[];
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}): Promise<GuardTurnResult> {
  const { llm, config, ctx, history } = args;
  const now = args.now ?? Date.now;
  const startedAt = now();
  try {
    const messages = historyToMessages(history);
    const tools = config.tools(ctx);
    const texts: string[] = [];
    for (let step = 0; step < MAX_STEPS; step++) {
      if (now() - startedAt > TURN_DEADLINE_MS) break;
      const res = await llm.create({
        model: GUARD_MODEL,
        max_tokens: 300,
        system: config.systemPrompt(ctx),
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });
      for (const block of res.content) if (block.type === 'text') texts.push(block.text);
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || uses.length === 0) break;
      let win = false;
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of uses) {
        const outcome = config.runTool(use.name, use.input, ctx);
        if (outcome.win) win = true;
        results.push({ type: 'tool_result', tool_use_id: use.id, content: outcome.result });
      }
      if (win) {
        const { text, mood } = parseMood(texts.join('\n'));
        return { text, mood, win: true };
      }
      messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: results });
    }
    const { text, mood } = parseMood(texts.join('\n'));
    return text ? { text, mood, win: false } : { text: FALLBACK_LINE, mood: 'talking', win: false };
  } catch (err) {
    console.error('[guard] LLM error:', err instanceof Error ? err.message : err);
    return { text: FALLBACK_LINE, mood: 'talking', win: false };
  }
}
