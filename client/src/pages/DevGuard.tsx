import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { LEVELS, getLevel } from '../../../shared/levels';
import type { GuardState } from '../../../shared/types';
import { Guard } from '../three/Guard';
import { Door } from '../three/Door';

const STATES: GuardState[] = ['idle', 'thinking', 'talking', 'angry', 'broken'];

const SPEECH: Record<GuardState, string> = {
  idle: 'Move along, tiny human.',
  thinking: '...',
  talking: 'Nobody gets past Brick. Not today, not ever, not even with cookies.',
  angry: 'WRONG! Do you think I was born yesterday?!',
  broken: "*sniff* ...fine. Go. Nobody ever asks how the GUARD is feeling...",
};

type Mode = 'mixed' | GuardState;
type View = 'gallery' | 'level';

const btn: React.CSSProperties = {
  font: '700 14px Nunito, sans-serif',
  padding: '6px 12px',
  border: '3px solid #000',
  borderRadius: 10,
  boxShadow: '3px 3px 0 #000',
  background: '#fff',
  cursor: 'pointer',
};
const btnOn: React.CSSProperties = { ...btn, background: '#ffd60a' };

export function DevGuard() {
  const [mode, setMode] = useState<Mode>('mixed');
  const [view, setView] = useState<View>(() =>
    new URLSearchParams(window.location.search).get('view') === 'level' ? 'level' : 'gallery',
  );
  const [level, setLevel] = useState(1);
  const [doorOpen, setDoorOpen] = useState(false);
  const [speechOn, setSpeechOn] = useState(true);

  const levelState: GuardState = mode === 'mixed' ? 'talking' : mode;
  const info = getLevel(level);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#c9d6e3' }}>
      <div
        style={{
          position: 'absolute',
          zIndex: 100,
          top: 10,
          left: 10,
          right: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <strong style={{ font: '24px Bangers, cursive', marginRight: 8 }}>Guard gallery</strong>
        <button style={view === 'gallery' ? btnOn : btn} onClick={() => setView('gallery')}>
          Gallery
        </button>
        <button style={view === 'level' ? btnOn : btn} onClick={() => setView('level')}>
          Level view
        </button>
        <span style={{ width: 12 }} />
        <button style={mode === 'mixed' ? btnOn : btn} onClick={() => setMode('mixed')}>
          one of each
        </button>
        {STATES.map((s) => (
          <button key={s} style={mode === s ? btnOn : btn} onClick={() => setMode(s)}>
            {s}
          </button>
        ))}
        <span style={{ width: 12 }} />
        <button style={speechOn ? btnOn : btn} onClick={() => setSpeechOn((v) => !v)}>
          speech
        </button>
        <button style={doorOpen ? btnOn : btn} onClick={() => setDoorOpen((v) => !v)}>
          door {doorOpen ? 'open' : 'closed'}
        </button>
        {view === 'level' &&
          LEVELS.map((l) => (
            <button key={l.id} style={level === l.id ? btnOn : btn} onClick={() => setLevel(l.id)}>
              L{l.id}
            </button>
          ))}
      </div>

      {view === 'gallery' ? (
        <Canvas key="gallery" camera={{ position: [0, 3.2, 19], fov: 50 }}>
          <color attach="background" args={['#c9d6e3']} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[3, 6, 5]} intensity={1.3} />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[40, 20]} />
            <meshStandardMaterial color="#8a94a0" />
          </mesh>
          <Door
            position={[0, 0, -2.5]}
            open={doorOpen}
            frameColor={LEVELS[0].doorColor}
            showKeypad
            onClick={() => setDoorOpen((v) => !v)}
          />
          {LEVELS.map((l, i) => {
            const state: GuardState = mode === 'mixed' ? STATES[i] : mode;
            return (
              <Guard
                key={l.id}
                look={l.look}
                state={state}
                speech={speechOn ? SPEECH[state] : null}
                name={l.guardName}
                position={[(i - 2) * 3.8 - 0.6, 0, 0]}
              />
            );
          })}
          <OrbitControls target={[0, 1.6, 0]} />
        </Canvas>
      ) : (
        <Canvas key="level" camera={{ position: [0, 1.8, 5], fov: 55 }}>
          <color attach="background" args={['#c9d6e3']} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 6, 4]} intensity={1.2} />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[12, 10]} />
            <meshStandardMaterial color="#777" />
          </mesh>
          <mesh position={[-3.6, 2, -2.05]}>
            <boxGeometry args={[5, 4, 0.1]} />
            <meshStandardMaterial color="#aab4c0" />
          </mesh>
          <mesh position={[3.6, 2, -2.05]}>
            <boxGeometry args={[5, 4, 0.1]} />
            <meshStandardMaterial color="#aab4c0" />
          </mesh>
          <Door
            open={doorOpen}
            frameColor={info.doorColor}
            showKeypad={info.winMode === 'passphrase'}
            onClick={() => setDoorOpen((v) => !v)}
          />
          <Guard
            key={level}
            look={info.look}
            state={levelState}
            speech={speechOn ? SPEECH[levelState] : null}
            name={info.guardName}
          />
          <OrbitControls target={[0, 1.5, -1]} />
        </Canvas>
      )}
    </div>
  );
}
