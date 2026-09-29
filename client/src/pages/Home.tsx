import { useEffect, useState, type FormEvent } from 'react';
import { warmTextFont } from '../net/preloadFont';

export function Home() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(warmTextFont, []);

  async function createGame() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/games', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { gameId?: string; hostToken?: string };
      if (!data.gameId || !data.hostToken) throw new Error('Bad response');
      window.location.href = `/host/${encodeURIComponent(data.gameId)}?token=${encodeURIComponent(data.hostToken)}`;
    } catch {
      setError("The server tripped over its own shoelaces. Try again in a sec!");
      setCreating(false);
    }
  }

  function joinByCode(e: FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean) window.location.href = `/play/${clean}`;
  }

  return (
    <main className="screen">
      <h1 className="title">BREAK THE GUARD</h1>
      <p className="subtitle">Trick 5 very large AI security guards. Learn AI security. Make them cry.</p>
      <div className="home-guards" aria-hidden="true">
        <span>💂</span><span>🚪</span><span>💪</span><span>🚪</span><span>😭</span>
      </div>
      <div className="home-cta">
        <button className="btn btn--go btn--big" onClick={createGame} disabled={creating}>
          {creating ? 'Hiring guards...' : 'Create game'}
        </button>
        {error && <div className="error-line" role="alert">{error}</div>}
        <form className="home-join" onSubmit={joinByCode}>
          <input
            className="input"
            placeholder="GAME CODE"
            aria-label="Game code"
            value={code}
            maxLength={12}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn btn--warn" type="submit" disabled={!code.trim()}>Join</button>
        </form>
      </div>
    </main>
  );
}
