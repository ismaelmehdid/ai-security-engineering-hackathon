import { describe, expect, it } from 'vitest';
import { rankPlayers } from './ranking';

const p = (name: string, level: number, reachedAt: number) => ({ playerId: name, name, level, reachedAt });

describe('rankPlayers', () => {
  it('orders by level desc, then earliest reachedAt, then name', () => {
    const ranked = rankPlayers([p('c', 2, 50), p('a', 3, 90), p('b', 3, 10), p('d', 2, 50), p('e', 6, 999)]);
    expect(ranked.map((r) => r.name)).toEqual(['e', 'b', 'a', 'c', 'd']);
  });
  it('does not mutate input', () => {
    const input = [p('a', 1, 2), p('b', 2, 1)];
    rankPlayers(input);
    expect(input[0].name).toBe('a');
  });
});
