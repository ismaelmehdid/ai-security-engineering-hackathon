import type { GameEvent } from '../../../shared/types';

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function EventFeed({ events }: { events: GameEvent[] }) {
  if (events.length === 0) return <p className="muted" style={{ fontWeight: 700 }}>Quiet... too quiet.</p>;
  return (
    <ul className="event-feed">
      {events.map((e) => (
        <li key={e.id} className="event">
          <span className="event__time">{clock(e.at)}</span>
          {e.text}
        </li>
      ))}
    </ul>
  );
}
