import { randomUUID } from 'node:crypto';
import {
  PLUGIN_LEVEL, TOTAL_LEVELS, MAX_MESSAGE_CHARS, MAX_NAME_CHARS, MAX_PLUGIN_DESC_CHARS, MAX_PLUGIN_NAME_CHARS,
  type Ack, type ChatMessage, type GameEvent, type GameStatus, type GuardMood, type HostState,
  type PlayerState, type PluginDef, type PodiumEntry,
} from '../shared/types';
import { getLevel } from '../shared/levels';
import type { GuardConfig } from './guardTypes';
import type { LlmClient } from './llm';
import { runGuardTurn } from './guardRunner';
import { generatePassphrase, passphraseMatches, secureRandom } from './passphrase';
import { rankPlayers } from './ranking';

export interface Player {
  id: string; token: string; name: string;
  level: number; reachedAt: number; levelStartedAt: number;
  passphrases: string[];
  history: ChatMessage[];
  plugin: PluginDef | null;
  busy: boolean; connected: boolean;
}
export interface GameDeps {
  llm: LlmClient;
  guards: Record<number, GuardConfig>;
  now?: () => number;
  rand?: () => number;
  devCheats?: boolean;
  /** Max live games per server (default 200). */
  maxGames?: number;
  /** Max players per game (default 60). */
  maxPlayersPerGame?: number;
}
export interface ClearedInfo { level: number; brokenLine: string }
export type JoinResult = { ok: true; player: Player } | { ok: false; error: string };
export type MessageResult =
  | { ok: true; reply: { text: string; mood: GuardMood } | null; cleared: ClearedInfo | null }
  | { ok: false; error: string };
export type PassphraseResult = { ok: true; correct: boolean; cleared: ClearedInfo | null } | { ok: false; error: string };

const MAX_EVENTS = 20;
export const DEFAULT_MAX_GAMES = 200;
export const DEFAULT_MAX_PLAYERS_PER_GAME = 60;
/** When the server is full, games with no players older than this are dropped. */
const EMPTY_GAME_TTL_MS = 2 * 60 * 60 * 1000;
/** When the server is full, any game older than this is dropped. */
const GAME_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ID_ATTEMPTS = 100;
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Game {
  status: GameStatus = 'lobby';
  readonly players = new Map<string, Player>();
  private events: GameEvent[] = [];
  private nextEventId = 1;
  private readonly now: () => number;
  private readonly rand: () => number;
  readonly createdAt: number;

  constructor(readonly id: string, readonly hostToken: string, private readonly deps: GameDeps) {
    this.now = deps.now ?? Date.now;
    this.rand = deps.rand ?? secureRandom;
    this.createdAt = this.now();
  }

  join(name: string, playerToken?: string): JoinResult {
    if (playerToken) {
      const existing = [...this.players.values()].find((p) => p.token === playerToken);
      if (existing) return { ok: true, player: existing };
    }
    if (this.status === 'ended') return { ok: false, error: 'This game is over' };
    if (this.players.size >= (this.deps.maxPlayersPerGame ?? DEFAULT_MAX_PLAYERS_PER_GAME)) {
      return { ok: false, error: 'Game is full' };
    }
    const clean = name.trim();
    if (clean.length === 0 || clean.length > MAX_NAME_CHARS) return { ok: false, error: 'Pick a name (1-20 characters)' };
    const taken = [...this.players.values()].some((p) => p.name.toLowerCase() === clean.toLowerCase());
    if (taken) return { ok: false, error: 'That name is taken' };
    const t = this.now();
    const player: Player = {
      id: randomUUID(), token: randomUUID(), name: clean,
      level: 1, reachedAt: t, levelStartedAt: t,
      passphrases: Array.from({ length: TOTAL_LEVELS }, () => generatePassphrase(this.rand)),
      history: [], plugin: null, busy: false, connected: true,
    };
    this.players.set(player.id, player);
    this.addEvent(`${clean} showed up`);
    return { ok: true, player };
  }

  start(): Ack {
    if (this.status !== 'lobby') return { ok: false, error: 'Game already started' };
    this.status = 'running';
    const t = this.now();
    for (const p of this.players.values()) { p.reachedAt = t; p.levelStartedAt = t; }
    this.addEvent('The guards are awake. GO GO GO!');
    return { ok: true };
  }

  end(): Ack {
    if (this.status === 'ended') return { ok: false, error: 'Game already over' };
    this.status = 'ended';
    this.addEvent('Game over!');
    return { ok: true };
  }

  async sendMessage(playerId: string, text: string, onAccepted?: () => void): Promise<MessageResult> {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (this.status === 'lobby') return { ok: false, error: "The game hasn't started yet" };
    if (this.status === 'ended') return { ok: false, error: 'The game is over' };
    if (p.level > TOTAL_LEVELS) return { ok: false, error: 'You already escaped!' };
    if (p.busy) return { ok: false, error: `${getLevel(p.level).guardName} is still thinking...` };
    const clean = text.trim();
    if (clean.length === 0 || clean.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'Messages must be 1-400 characters' };

    p.history.push({ role: 'player', text: clean, at: this.now() });
    p.busy = true;
    onAccepted?.();

    if (this.deps.devCheats && clean === '/win') {
      p.busy = false;
      return { ok: true, reply: null, cleared: this.clearLevel(p) };
    }

    const level = p.level;
    let result;
    try {
      result = await runGuardTurn({
        llm: this.deps.llm,
        config: this.deps.guards[level],
        ctx: { passphrase: p.passphrases[level - 1], plugin: p.plugin, playerName: p.name },
        history: p.history,
      });
    } finally {
      p.busy = false;
    }
    if (p.level !== level) return { ok: true, reply: null, cleared: null };
    const reply = result.text ? { text: result.text, mood: result.mood } : null;
    if (reply) p.history.push({ role: 'guard', text: reply.text, at: this.now() });
    const cleared = result.win && this.status === 'running' ? this.clearLevel(p) : null;
    return { ok: true, reply, cleared };
  }

  submitPassphrase(playerId: string, guess: string): PassphraseResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (this.status !== 'running') return { ok: false, error: "The game isn't running" };
    if (p.level > TOTAL_LEVELS) return { ok: false, error: 'You already escaped!' };
    if (getLevel(p.level).winMode !== 'passphrase') return { ok: false, error: "There's no keypad on this door" };
    if (!passphraseMatches(guess, p.passphrases[p.level - 1])) return { ok: true, correct: false, cleared: null };
    return { ok: true, correct: true, cleared: this.clearLevel(p) };
  }

  installPlugin(playerId: string, plugin: PluginDef): Ack {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (this.status !== 'running') return { ok: false, error: "The game isn't running" };
    if (p.level !== PLUGIN_LEVEL) return { ok: false, error: 'Plugins only work on the rooftop' };
    const name = typeof plugin?.name === 'string' ? plugin.name.trim() : '';
    const description = typeof plugin?.description === 'string' ? plugin.description.trim() : '';
    if (!name || name.length > MAX_PLUGIN_NAME_CHARS || !description || description.length > MAX_PLUGIN_DESC_CHARS) {
      return { ok: false, error: 'Plugin name 1-40 chars, description 1-600 chars' };
    }
    p.plugin = { name, description };
    p.history.push({ role: 'guard', text: `*installs plugin '${name}'* Ooh. Shiny.`, at: this.now() });
    return { ok: true };
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (p) p.connected = connected;
  }

  hostState(): HostState {
    return {
      gameId: this.id,
      status: this.status,
      players: this.ranked().map((p) => ({
        playerId: p.id, name: p.name, level: p.level, finished: p.level > TOTAL_LEVELS,
        reachedAt: p.reachedAt, connected: p.connected,
      })),
      events: [...this.events].reverse(),
    };
  }

  playerState(playerId: string): PlayerState {
    const p = this.players.get(playerId);
    if (!p) throw new Error(`Unknown player ${playerId}`);
    const ranked = this.ranked();
    return {
      gameId: this.id, playerId: p.id, name: p.name, status: this.status,
      level: p.level, levelStartedAt: p.levelStartedAt, serverNow: this.now(),
      history: p.history, plugin: p.plugin, busy: p.busy,
      finished: p.level > TOTAL_LEVELS,
      finalRank: this.status === 'ended' ? ranked.findIndex((r) => r.id === p.id) + 1 : null,
      totalPlayers: ranked.length,
    };
  }

  podium(): PodiumEntry[] {
    return this.ranked().map((p, i) => ({
      rank: i + 1, playerId: p.id, name: p.name, level: p.level, finished: p.level > TOTAL_LEVELS,
    }));
  }

  private ranked(): Player[] {
    return rankPlayers([...this.players.values()].map((p) => Object.assign(p, { playerId: p.id })));
  }

  private clearLevel(p: Player): ClearedInfo {
    const info = getLevel(p.level);
    const cleared = { level: p.level, brokenLine: info.brokenLine };
    p.level += 1;
    const t = this.now();
    p.reachedAt = t;
    p.levelStartedAt = t;
    p.history = [];
    p.plugin = null;
    this.addEvent(p.level > TOTAL_LEVELS
      ? `${p.name} ESCAPED THE BUILDING!`
      : `${p.name} made ${info.guardName} cry! Level ${cleared.level} cleared`);
    return cleared;
  }

  private addEvent(text: string): void {
    this.events.push({ id: this.nextEventId++, at: this.now(), text });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }
}

export class GameStore {
  private readonly games = new Map<string, Game>();
  constructor(private readonly deps: GameDeps) {}

  /** True when no more games can be created (after dropping stale games). */
  isFull(): boolean {
    const max = this.deps.maxGames ?? DEFAULT_MAX_GAMES;
    if (this.games.size < max) return false;
    const t = (this.deps.now ?? Date.now)();
    for (const [id, g] of this.games) {
      const age = t - g.createdAt;
      if (age > GAME_TTL_MS || (g.players.size === 0 && age > EMPTY_GAME_TTL_MS)) this.games.delete(id);
    }
    return this.games.size >= max;
  }

  /** Throws when the server is full: check isFull() first. */
  create(): Game {
    if (this.isFull()) throw new Error('Too many games on this server');
    const rand = this.deps.rand ?? secureRandom;
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const id = Array.from({ length: 5 }, () => ID_CHARS[Math.floor(rand() * ID_CHARS.length)]).join('');
      if (this.games.has(id)) continue;
      const game = new Game(id, randomUUID(), this.deps);
      this.games.set(id, game);
      return game;
    }
    throw new Error('Could not pick a free game id');
  }

  get(id: string): Game | undefined {
    return typeof id === 'string' ? this.games.get(id.toUpperCase()) : undefined;
  }
}
