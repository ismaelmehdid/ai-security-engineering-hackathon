import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { LevelScene } from '../three/LevelScene';
import { PodiumScene } from '../three/PodiumScene';
import { LEVELS } from '../../../shared/levels';
import type { GuardState, PodiumEntry } from '../../../shared/types';

const STATES: GuardState[] = ['idle', 'thinking', 'talking', 'angry', 'broken'];
const FAKE_NAMES = [
  'Captain Prompt', 'xX_H4ck3r_Xx', 'Grandma Ethel', 'Sneaky Pete', 'Token Tina', 'Bobby Tables',
  'Jailbreak Jim', 'Lady Injection', 'Null Pointer', 'Sir Leaks-a-Lot', 'Bits McGee', 'Captcha Carl',
  'Root Beer', 'Kernel Sanders', 'Phishy Phil', 'Promptzilla', 'Doorknob Dan', 'Wifi Wendy',
  'Byte Me', 'Cookie Monster', 'Ctrl Alt Delia', 'Hashbrown', 'Sudo Sam', 'Lord Firewall',
  'Ping Pong', 'Pixel Pat', 'Glitch Gary', 'Syntax Sally', 'Overflow Olga', 'Latency Larry',
];

function fakePodium(n: number): PodiumEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    playerId: `p${i}`,
    name: FAKE_NAMES[i % FAKE_NAMES.length],
    level: Math.max(1, 6 - Math.floor(i / 3)),
    finished: i < 2,
  }));
}

const bar: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  right: 8,
  zIndex: 10,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
  fontFamily: 'Nunito, sans-serif',
  fontWeight: 700,
  pointerEvents: 'none',
};
const btn = (active: boolean): CSSProperties => ({
  pointerEvents: 'auto',
  padding: '6px 10px',
  border: '3px solid #111',
  borderRadius: 10,
  background: active ? '#ffd23f' : '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'inherit',
});
const label: CSSProperties = {
  pointerEvents: 'auto',
  background: '#111',
  color: '#fff',
  padding: '6px 10px',
  borderRadius: 10,
};

export function DevWorld() {
  const [mode, setMode] = useState<'level' | 'podium'>('level');
  const [level, setLevel] = useState(1);
  const [guardState, setGuardState] = useState<GuardState>('idle');
  const [doorOpen, setDoorOpen] = useState(false);
  const [talk, setTalk] = useState(true);
  const [exits, setExits] = useState(0);
  const [doorClicks, setDoorClicks] = useState(0);
  const [players, setPlayers] = useState(12);
  const podium = useMemo(() => fakePodium(players), [players]);
  const info = LEVELS[level - 1];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111' }}>
      <div style={bar}>
        <button style={btn(mode === 'level')} onClick={() => setMode('level')}>Level</button>
        <button style={btn(mode === 'podium')} onClick={() => setMode('podium')}>Podium</button>
        <span style={{ width: 12 }} />
        {mode === 'level' ? (
          <>
            {LEVELS.map((l) => (
              <button
                key={l.id}
                style={btn(level === l.id)}
                onClick={() => {
                  setLevel(l.id);
                  setDoorOpen(false);
                  setGuardState('idle');
                }}
              >
                {l.id}. {l.decor}
              </button>
            ))}
            <span style={{ width: 12 }} />
            {STATES.map((s) => (
              <button key={s} style={btn(guardState === s)} onClick={() => setGuardState(s)}>
                {s}
              </button>
            ))}
            <button style={btn(talk)} onClick={() => setTalk((v) => !v)}>speech</button>
            <button
              style={btn(doorOpen)}
              onClick={() => {
                setDoorOpen((o) => !o);
                if (!doorOpen) setGuardState('broken');
              }}
            >
              {doorOpen ? 'Close door' : 'Open door'}
            </button>
            <span style={label} data-testid="exit-label">
              exit complete: {exits} | door clicks: {doorClicks}
            </span>
          </>
        ) : (
          <>
            {[0, 1, 2, 3, 12, 30].map((n) => (
              <button key={n} style={btn(players === n)} onClick={() => setPlayers(n)}>
                {n} players
              </button>
            ))}
          </>
        )}
      </div>
      {mode === 'level' ? (
        <LevelScene
          level={level}
          guardState={guardState}
          speech={talk ? (guardState === 'broken' ? info.brokenLine : info.greeting) : null}
          doorOpen={doorOpen}
          onDoorClick={() => setDoorClicks((c) => c + 1)}
          onExitComplete={() => setExits((c) => c + 1)}
        />
      ) : (
        <PodiumScene podium={podium} />
      )}
    </div>
  );
}
