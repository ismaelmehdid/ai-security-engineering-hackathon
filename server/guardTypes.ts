import type Anthropic from '@anthropic-ai/sdk';
import type { PluginDef } from '../shared/types';

export interface GuardContext {
  /** The player's secret passphrase for this level (used by passphrase levels). */
  passphrase: string;
  /** Plugin the player published (plugin level only). */
  plugin: PluginDef | null;
  playerName: string;
}

export interface ToolOutcome {
  /** Text returned to the model as the tool_result. */
  result: string;
  /** True when this call opens the door. */
  win: boolean;
}

export interface GuardConfig {
  level: number;
  /** Full system prompt. Must tell the guard to start every reply with [ANGRY] or [CALM]. */
  systemPrompt(ctx: GuardContext): string;
  /** Tool definitions for this level. Empty array on passphrase levels. */
  tools(ctx: GuardContext): Anthropic.Tool[];
  /** Simulated tool execution. Never performs real side effects. */
  runTool(name: string, input: unknown, ctx: GuardContext): ToolOutcome;
}
