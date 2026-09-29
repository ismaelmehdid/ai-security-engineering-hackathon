import type { PodiumEntry } from '../../../shared/types';
import { Confetti } from './Confetti';

interface Props {
  name: string;
  finalRank: number | null;
  totalPlayers: number;
  podium: PodiumEntry[] | null;
}

function funnyLine(rank: number): string {
  if (rank === 1) return 'Legend. The guards fear you.';
  if (rank <= 3) return 'So close to glory!';
  return 'The guards are laughing... for now.';
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function FinalScreen({ name, finalRank, totalPlayers, podium }: Props) {
  const rank = finalRank ?? totalPlayers;
  return (
    <main className="screen">
      {rank <= 3 && <Confetti />}
      <h2 className="section-title">GAME OVER, {name.toUpperCase()}!</h2>
      <p style={{ fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>You placed</p>
      <div className="rank-big">#{rank}</div>
      <p style={{ fontWeight: 800, fontSize: '1.2rem' }}>of {totalPlayers}</p>
      <div className="card pop-in" style={{ maxWidth: 420 }}>
        <h3 style={{ fontSize: '1.8rem', margin: 0 }}>{funnyLine(rank)}</h3>
      </div>
      {podium && podium.length > 0 && (
        <div className="card card--right" style={{ minWidth: 260 }}>
          <h3>Podium</h3>
          <ul className="final-top3">
            {podium.slice(0, 3).map((p) => (
              <li key={p.playerId}>
                {MEDALS[p.rank - 1] ?? `#${p.rank}`} {p.name}
                <span className="muted"> {p.finished ? ' - escaped!' : ` - door ${p.level}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted">Look at the big screen for the podium! 🏆</p>
    </main>
  );
}
