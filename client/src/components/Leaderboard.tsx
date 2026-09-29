import { TOTAL_LEVELS, type LeaderboardRow } from '../../../shared/types';
import { formatMmSs, useNow } from '../hooks/useNow';

const ROW_H = 56;
const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard({ players }: { players: LeaderboardRow[] }) {
  const now = useNow(1000);
  // Render in a stable (id) order so DOM nodes persist and the transform animates the reorder.
  const rankById = new Map(players.map((p, i) => [p.playerId, i]));
  const stable = [...players].sort((a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));

  if (players.length === 0) {
    return <p className="muted" style={{ fontWeight: 700 }}>No players yet. Share the link!</p>;
  }

  return (
    <div className="leaderboard" style={{ height: players.length * ROW_H }}>
      {stable.map((p) => {
        const rank = rankById.get(p.playerId) ?? 0;
        const cls = ['lb-row', p.finished ? 'lb-row--escaped' : '', p.connected ? '' : 'lb-row--gone'].join(' ');
        return (
          <div key={p.playerId} className={cls} style={{ transform: `translateY(${rank * ROW_H}px)`, zIndex: 100 - rank }}>
            <span className="lb-rank">{MEDALS[rank] ?? rank + 1}</span>
            <span className="lb-name" title={p.name}>
              {p.name}
              {!p.connected && <span className="muted" style={{ fontSize: '0.8rem' }}> (zzz)</span>}
            </span>
            <span className="lb-doors" aria-label={`Level ${Math.min(p.level, TOTAL_LEVELS)} of ${TOTAL_LEVELS}`}>
              {Array.from({ length: TOTAL_LEVELS }, (_, i) => {
                const lvl = i + 1;
                const state = p.finished || lvl < p.level ? 'door-icon--done' : lvl === p.level ? 'door-icon--current' : '';
                return <span key={lvl} className={`door-icon ${state}`} />;
              })}
            </span>
            {p.finished ? (
              <span className="badge badge--go lb-escaped">ESCAPED!</span>
            ) : (
              <span className="lb-time" title="Time on current door">{formatMmSs((now - p.reachedAt) / 1000)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
