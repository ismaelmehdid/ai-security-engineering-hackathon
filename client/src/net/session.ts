export interface PlayerSession {
  playerId: string;
  playerToken: string;
}

const key = (gameId: string) => `btg:player:${gameId.toUpperCase()}`;

export function loadPlayerSession(gameId: string): PlayerSession | null {
  try {
    const raw = localStorage.getItem(key(gameId));
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<PlayerSession>;
    if (typeof s?.playerId === 'string' && typeof s?.playerToken === 'string') {
      return { playerId: s.playerId, playerToken: s.playerToken };
    }
    return null;
  } catch {
    return null;
  }
}

export function savePlayerSession(gameId: string, s: PlayerSession): void {
  try {
    localStorage.setItem(key(gameId), JSON.stringify({ playerId: s.playerId, playerToken: s.playerToken }));
  } catch {
    /* storage blocked: progress just won't survive a reload */
  }
}

export function clearPlayerSession(gameId: string): void {
  try {
    localStorage.removeItem(key(gameId));
  } catch {
    /* ignore */
  }
}

const hostKey = (gameId: string) => `btg:host:${gameId.toUpperCase()}`;

export function loadHostToken(gameId: string): string | null {
  try {
    return localStorage.getItem(hostKey(gameId));
  } catch {
    return null;
  }
}

export function saveHostToken(gameId: string, token: string): void {
  try {
    localStorage.setItem(hostKey(gameId), token);
  } catch {
    /* ignore */
  }
}
