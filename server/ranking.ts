export interface RankInput {
  playerId: string;
  name: string;
  level: number;
  reachedAt: number;
}

export function comparePlayers(a: RankInput, b: RankInput): number {
  if (a.level !== b.level) return b.level - a.level;
  if (a.reachedAt !== b.reachedAt) return a.reachedAt - b.reachedAt;
  return a.name.localeCompare(b.name);
}

export function rankPlayers<T extends RankInput>(players: T[]): T[] {
  return [...players].sort(comparePlayers);
}
