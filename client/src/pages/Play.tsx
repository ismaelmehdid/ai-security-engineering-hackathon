import { useEffect, useState } from 'react';
import { getLevel } from '../../../shared/levels';
import { PLUGIN_LEVEL, TOTAL_LEVELS } from '../../../shared/types';
import { usePlayerGame } from '../hooks/usePlayerGame';
import { LevelScene } from '../three/LevelScene';
import { JoinForm } from '../components/JoinForm';
import { ConceptCard } from '../components/ConceptCard';
import { ChatPanel } from '../components/ChatPanel';
import { HintsPanel } from '../components/HintsPanel';
import { KeypadModal } from '../components/KeypadModal';
import { PluginEditor } from '../components/PluginEditor';
import { LessonCard } from '../components/LessonCard';
import { FinalScreen } from '../components/FinalScreen';
import { Confetti } from '../components/Confetti';
import { warmTextFont } from '../net/preloadFont';

export function Play({ gameId }: { gameId: string }) {
  const g = usePlayerGame(gameId);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [lessonFallback, setLessonFallback] = useState(false);

  useEffect(warmTextFont, []);

  // Show the lesson even if the camera exit never reports back.
  useEffect(() => {
    if (g.phase !== 'cleared') {
      setLessonFallback(false);
      return;
    }
    const id = window.setTimeout(() => setLessonFallback(true), 5000);
    return () => window.clearTimeout(id);
  }, [g.phase]);

  useEffect(() => {
    if (g.phase !== 'playing') setKeypadOpen(false);
    // Make sure the big moment (guard cries, door opens) is on screen.
    if (g.phase === 'cleared') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [g.phase]);

  const toast = g.error && g.phase !== 'join' ? (
    <div className="toast" role="alert">
      <div className="error-line">{g.error}</div>
    </div>
  ) : null;

  if (g.phase === 'join' || !g.state) {
    return (
      <JoinForm gameId={gameId} error={g.error} restoring={g.restoring} notFound={g.notFound} onJoin={g.join} />
    );
  }

  const state = g.state;

  if (g.phase === 'waiting') {
    return (
      <main className="screen">
        <div className="bouncer" aria-hidden="true">💂</div>
        <h1 className="title title--small">YOU&apos;RE IN, {state.name.toUpperCase()}!</h1>
        <p className="subtitle">
          Waiting for the host to press Start<span className="dots" />
        </p>
        <p className="muted">The guards are doing push-ups. Stretch your typing fingers.</p>
        <span className="game-code">{gameId}</span>
        {toast}
      </main>
    );
  }

  if (g.phase === 'ended') {
    return <FinalScreen name={state.name} finalRank={state.finalRank} totalPlayers={state.totalPlayers} podium={g.podium} />;
  }

  if (g.phase === 'finished') {
    return (
      <main className="screen">
        <Confetti />
        <div className="bouncer" aria-hidden="true">🏃💨</div>
        <h1 className="title escaped-title">YOU ESCAPED THE BUILDING!</h1>
        <p className="subtitle">All {TOTAL_LEVELS} guards are sobbing in a corner. Nice work, {state.name}.</p>
        <p className="muted" style={{ fontWeight: 700 }}>
          Wait for the host to end the game<span className="dots" />
        </p>
        {toast}
      </main>
    );
  }

  const level = getLevel(g.displayLevel);

  // intro | playing | cleared: keep the 3D scene mounted across levels (the concept card
  // overlays it), so the WebGL canvas is not torn down between doors.
  const intro = g.phase === 'intro';
  const cleared = g.phase === 'cleared';
  const canKeypad = g.phase === 'playing' && level.winMode === 'passphrase';

  return (
    <div className="play-layout">
      <div className="play-canvas">
        <div className="canvas-fill">
          <LevelScene
            level={level.id}
            guardState={g.guardState}
            speech={g.speech}
            doorOpen={g.doorOpen}
            onDoorClick={canKeypad ? () => setKeypadOpen(true) : undefined}
            onExitComplete={g.onExitComplete}
          />
        </div>
        <div className="scene-hud">
          <span className="badge">Door {level.id}/{TOTAL_LEVELS}</span>
          <span className="badge badge--pop">{level.topic}</span>
        </div>
      </div>
      <aside className="play-panel">
        <div className="panel-head">
          <h2>{level.guardName} <span className="muted" style={{ fontSize: '1.1rem' }}>· {level.title}</span></h2>
        </div>
        {canKeypad && (
          <div className="panel-actions">
            <button className="btn btn--warn btn--small" onClick={() => setKeypadOpen(true)}>
              🔑 Type passphrase
            </button>
            <span className="muted" style={{ alignSelf: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
              (or click the door)
            </span>
          </div>
        )}
        <div className="panel-scroll">
          {!cleared && (
            <HintsPanel hints={level.hints} levelStartedAt={state.levelStartedAt} clockOffset={g.clockOffset} />
          )}
          {level.id === PLUGIN_LEVEL && (
            <PluginEditor plugin={cleared ? null : state.plugin} disabled={cleared} onPublish={g.publishPlugin} />
          )}
        </div>
        <ChatPanel
          history={g.history}
          guardName={level.guardName}
          placeholder={cleared ? 'The door is open! 🚪' : level.inputPlaceholder}
          greeting={level.greeting}
          busy={!cleared && state.busy}
          disabled={cleared || intro}
          onSend={g.send}
        />
      </aside>
      {keypadOpen && canKeypad && (
        <KeypadModal guardName={level.guardName} onClose={() => setKeypadOpen(false)} onSubmit={g.guess} />
      )}
      {intro && <ConceptCard level={level} onStart={g.startLevel} />}
      {cleared && (g.exitDone || lessonFallback) && <LessonCard level={level} onNext={g.nextLevel} />}
      {toast}
    </div>
  );
}
