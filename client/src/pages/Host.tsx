import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TOTAL_LEVELS, type PodiumEntry } from '../../../shared/types';
import { useHostGame } from '../hooks/useHostGame';
import { loadHostToken } from '../net/session';
import { Leaderboard } from '../components/Leaderboard';
import { EventFeed } from '../components/EventFeed';
import { PodiumScene } from '../three/PodiumScene';
import { warmTextFont } from '../net/preloadFont';

const MEDALS = ['🥇', '🥈', '🥉'];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link:', text);
    }
  }
  return (
    <button className="btn btn--blue btn--small" onClick={copy}>
      {copied ? 'Copied! ✅' : '📋 Copy link'}
    </button>
  );
}

function HostHeader({ gameId, right }: { gameId: string; right?: ReactNode }) {
  return (
    <header className="host-header">
      <h1 className="title title--small" style={{ margin: 0 }}>BREAK THE GUARD</h1>
      <div className="host-header__right">
        <span style={{ fontWeight: 800 }}>Game code</span>
        <span className="game-code">{gameId}</span>
        {right}
      </div>
    </header>
  );
}

function PodiumView({ podium }: { podium: PodiumEntry[] }) {
  return (
    <div className="podium-screen">
      <div className="canvas-fill">
        <PodiumScene podium={podium} />
      </div>
      <div className="card card--flat podium-list">
        <h3 style={{ fontSize: '1.6rem' }}>Final ranking</h3>
        {podium.length === 0 ? (
          <p className="muted">Nobody showed up. The guards win by default.</p>
        ) : (
          <ol>
            {podium.map((p) => (
              <li key={p.playerId}>
                {MEDALS[p.rank - 1] ? `${MEDALS[p.rank - 1]} ` : ''}
                {p.name}
                <span className="muted" style={{ fontWeight: 700 }}>
                  {p.finished ? ' - escaped!' : ` - door ${Math.min(p.level, TOTAL_LEVELS)}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export function Host({ gameId }: { gameId: string }) {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get('token') || loadHostToken(gameId),
    [gameId],
  );
  const h = useHostGame(gameId, token);
  const [starting, setStarting] = useState(false);
  const joinUrl = `${window.location.origin}/play/${gameId}`;

  useEffect(warmTextFont, []);

  if (!h.state) {
    return (
      <main className="screen">
        {h.error ? (
          <div className="card join-card pop-in">
            <div className="bouncer" aria-hidden="true">🚫</div>
            <h2 className="section-title">NO ENTRY</h2>
            <div className="error-line">{h.error}</div>
            <p style={{ marginTop: '1rem' }}>
              <a className="btn btn--warn" href="/">Make a new game</a>
            </p>
          </div>
        ) : (
          <>
            <div className="bouncer" aria-hidden="true">💂</div>
            <h2 className="section-title">Unlocking the control room<span className="dots" /></h2>
          </>
        )}
      </main>
    );
  }

  const { state } = h;
  const toast = h.error ? (
    <div className="toast" role="alert">
      <div className="error-line">{h.error}</div>
    </div>
  ) : null;

  if (state.status === 'ended') {
    return (
      <>
        <PodiumView podium={h.podium ?? []} />
        {toast}
      </>
    );
  }

  if (state.status === 'lobby') {
    const n = state.players.length;
    async function start() {
      setStarting(true);
      await h.start();
      setStarting(false);
    }
    return (
      <div className="host-page">
        <HostHeader gameId={gameId} />
        <main style={{ padding: 20 }}>
          <div className="lobby-grid">
            <div className="qr-box">
              <QRCodeSVG value={joinUrl} size={260} marginSize={1} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 className="section-title" style={{ fontSize: '2.6rem' }}>SCAN TO JOIN THE HEIST!</h2>
              <div className="join-url">{joinUrl}</div>
              <CopyButton text={joinUrl} />
              <div style={{ marginTop: '1.4rem' }}>
                <span className="player-count">
                  {n} {n === 1 ? 'sneaky human' : 'sneaky humans'} ready
                </span>
                <div className="name-cloud">
                  {n === 0 && <span className="muted" style={{ fontWeight: 700 }}>Waiting for brave souls<span className="dots" /></span>}
                  {state.players.map((p) => (
                    <span key={p.playerId} className="name-chip">{p.name}</span>
                  ))}
                </div>
                <button className="btn btn--danger btn--big" onClick={start} disabled={n === 0 || starting}>
                  {starting ? 'Waking guards...' : 'START'}
                </button>
                {n === 0 && <p className="muted" style={{ marginTop: '0.6rem' }}>Need at least one player to start.</p>}
              </div>
            </div>
          </div>
        </main>
        {toast}
      </div>
    );
  }

  // running
  async function endGame() {
    if (window.confirm('End the game for everyone and show the podium?')) await h.end();
  }
  const escaped = state.players.filter((p) => p.finished).length;

  return (
    <div className="host-page">
      <HostHeader
        gameId={gameId}
        right={
          <button className="btn btn--danger btn--small" onClick={endGame}>
            END GAME
          </button>
        }
      />
      <div className="host-layout">
        <section className="card card--flat">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 className="section-title">LEADERBOARD</h2>
            <span className="badge badge--go">
              {escaped}/{state.players.length} escaped
            </span>
          </div>
          <Leaderboard players={state.players} />
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <section className="card card--right">
            <h2 className="section-title">LIVE FEED</h2>
            <EventFeed events={state.events} />
          </section>
          <section className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ background: '#fff', lineHeight: 0, flex: '0 0 auto' }}>
              <QRCodeSVG value={joinUrl} size={96} marginSize={1} />
            </div>
            <div style={{ minWidth: 0 }}>
              <strong>Late? Still time to join!</strong>
              <div className="mono" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{joinUrl}</div>
            </div>
          </section>
        </div>
      </div>
      {toast}
    </div>
  );
}
