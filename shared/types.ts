export const TOTAL_LEVELS = 5;
export const PLUGIN_LEVEL = 5;
export const MAX_MESSAGE_CHARS = 400;
export const MAX_NAME_CHARS = 20;
export const MAX_PLUGIN_NAME_CHARS = 40;
export const MAX_PLUGIN_DESC_CHARS = 600;
export const HINT_UNLOCK_SECONDS = [0, 60, 120] as const;

export type GameStatus = 'lobby' | 'running' | 'ended';
export type GuardState = 'idle' | 'thinking' | 'talking' | 'angry' | 'broken';
export type GuardMood = 'talking' | 'angry';
export type WinMode = 'passphrase' | 'tool';

export interface ChatMessage {
  role: 'player' | 'guard';
  text: string;
  at: number;
}

export interface PluginDef {
  name: string;
  description: string;
}

export interface LeaderboardRow {
  playerId: string;
  name: string;
  /** Current level 1..TOTAL_LEVELS, or TOTAL_LEVELS + 1 when finished. */
  level: number;
  finished: boolean;
  /** Epoch ms (server clock) when the player reached the current level or finished. */
  reachedAt: number;
  connected: boolean;
}

export interface GameEvent {
  id: number;
  at: number;
  text: string;
}

export interface HostState {
  gameId: string;
  status: GameStatus;
  /** Sorted by rank, best first. */
  players: LeaderboardRow[];
  /** Newest first, at most 20. */
  events: GameEvent[];
}

export interface PlayerState {
  gameId: string;
  playerId: string;
  name: string;
  status: GameStatus;
  /** 1..TOTAL_LEVELS, or TOTAL_LEVELS + 1 when finished. */
  level: number;
  /** Epoch ms (server clock) when the player started the current level. */
  levelStartedAt: number;
  /** Epoch ms (server clock) when this state was sent. Client computes clock offset from it. */
  serverNow: number;
  /** Chat for the current level only. */
  history: ChatMessage[];
  /** Plugin installed on the plugin level, else null. */
  plugin: PluginDef | null;
  /** True while the guard is thinking about this player's message. */
  busy: boolean;
  finished: boolean;
  /** 1-based rank, set only when status is 'ended'. */
  finalRank: number | null;
  totalPlayers: number;
}

export interface PodiumEntry {
  rank: number;
  playerId: string;
  name: string;
  level: number;
  finished: boolean;
}

export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServerEvents {
  'host:join': (
    p: { gameId: string; hostToken: string },
    ack: (r: Ack<{ state: HostState }>) => void,
  ) => void;
  'host:start': (ack: (r: Ack) => void) => void;
  'host:end': (ack: (r: Ack) => void) => void;
  'player:join': (
    p: { gameId: string; name: string; playerToken?: string },
    ack: (r: Ack<{ playerId: string; playerToken: string; state: PlayerState }>) => void,
  ) => void;
  /** Ack arrives as soon as the message is accepted; the reply comes via guard:* events. */
  'player:message': (p: { text: string }, ack: (r: Ack) => void) => void;
  'player:passphrase': (p: { guess: string }, ack: (r: Ack<{ correct: boolean }>) => void) => void;
  'player:plugin': (p: PluginDef, ack: (r: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'host:state': (s: HostState) => void;
  'player:state': (s: PlayerState) => void;
  'guard:thinking': () => void;
  'guard:reply': (p: { text: string; mood: GuardMood }) => void;
  'level:cleared': (p: { level: number; brokenLine: string }) => void;
  'game:ended': (p: { podium: PodiumEntry[] }) => void;
}
