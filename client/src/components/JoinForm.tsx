import { useState, type FormEvent } from 'react';
import { MAX_NAME_CHARS } from '../../../shared/types';

interface Props {
  gameId: string;
  error: string | null;
  restoring: boolean;
  notFound: boolean;
  onJoin(name: string): Promise<void>;
}

export function JoinForm({ gameId, error, restoring, notFound, onJoin }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (notFound) {
    return (
      <main className="screen">
        <div className="card join-card pop-in">
          <div className="bouncer" aria-hidden="true">🤷</div>
          <h1 className="title title--small">GAME NOT FOUND</h1>
          <p>No building with code <span className="game-code">{gameId}</span> exists. Maybe the guards ate it.</p>
          <a className="btn btn--warn" href="/">Back to the street</a>
        </div>
      </main>
    );
  }

  if (restoring) {
    return (
      <main className="screen">
        <div className="bouncer" aria-hidden="true">🕵️</div>
        <h2 className="section-title">Sneaking back in<span className="dots" /></h2>
      </main>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    await onJoin(name);
    setBusy(false);
  }

  return (
    <main className="screen">
      <h1 className="title title--small">BREAK THE GUARD</h1>
      <div className="card join-card pop-in">
        <p style={{ margin: 0 }}>
          Game code <span className="game-code">{gameId}</span>
        </p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="player-name">Your hacker name</label>
          <input
            id="player-name"
            className="input input--big"
            placeholder="e.g. Captain Prompt"
            autoComplete="off"
            autoFocus
            maxLength={MAX_NAME_CHARS}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="counter">{name.length}/{MAX_NAME_CHARS}</div>
          <button className="btn btn--go btn--chunky btn--block" type="submit" disabled={!name.trim() || busy}>
            {busy ? 'Sneaking in...' : 'Enter the building'}
          </button>
        </form>
        {error && <div className="error-line" role="alert">{error}</div>}
      </div>
    </main>
  );
}
