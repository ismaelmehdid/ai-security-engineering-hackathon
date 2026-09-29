import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getLevel } from '../../../shared/levels';
import type { GuardState } from '../../../shared/types';
import { Guard } from './Guard';
import { Door } from './Door';
import { DECOR } from './decor';

export interface LevelSceneProps {
  level: number;
  guardState: GuardState;
  speech: string | null;
  doorOpen: boolean;
  onDoorClick?: () => void;
  onExitComplete?: () => void;
}

const HOME_POS = new THREE.Vector3(0, 1.8, 5);
const HOME_LOOK = new THREE.Vector3(0, 1.5, -1);
const EXIT_POS = new THREE.Vector3(0, 1.6, -3.5);
const EXIT_LOOK = new THREE.Vector3(0, 1.6, -9);
const EXIT_DELAY = 1.2; // seconds: guard steps aside first
const EXIT_DURATION = 2; // seconds

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/**
 * Default: gentle sway around the home shot. When doorOpen turns true: wait 1.2 s, glide
 * through the doorway over 2 s, then call onExitComplete exactly once. Resets on level change.
 */
function CameraRig({ level, doorOpen, onExitComplete }: { level: number; doorOpen: boolean; onExitComplete?: () => void }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const openedAt = useRef<number | null>(null);
  const startPos = useRef(new THREE.Vector3());
  const startLook = useRef(new THREE.Vector3());
  const moving = useRef(false);
  const done = useRef(false);
  const look = useRef(HOME_LOOK.clone());
  const tmp = useRef(new THREE.Vector3());
  const onExitRef = useRef(onExitComplete);
  onExitRef.current = onExitComplete;

  const reset = () => {
    openedAt.current = null;
    moving.current = false;
    done.current = false;
    camera.position.copy(HOME_POS);
    look.current.copy(HOME_LOOK);
    camera.lookAt(look.current);
  };

  // Narrow (phone portrait) canvases: widen the fov so the guard and door still fit.
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || size.height === 0) return;
    const aspect = size.width / size.height;
    const wanted = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(32)) / aspect));
    camera.fov = THREE.MathUtils.clamp(wanted, 55, 80);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  // Snap back to the home shot whenever the level changes.
  useEffect(reset, [level, camera]); // eslint-disable-line react-hooks/exhaustive-deps

  // Door closed again (e.g. dev page toggle): return to normal framing.
  useEffect(() => {
    if (!doorOpen) {
      openedAt.current = null;
      moving.current = false;
      done.current = false;
    }
  }, [doorOpen]);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (doorOpen && openedAt.current === null) openedAt.current = t;

    if (!doorOpen || openedAt.current === null || t - openedAt.current < EXIT_DELAY) {
      // idle sway (also holds during the 1.2 s wait while the guard steps aside)
      const target = tmp.current.set(Math.sin(t * 0.25) * 0.25, HOME_POS.y + Math.sin(t * 0.4) * 0.05, HOME_POS.z);
      camera.position.lerp(target, Math.min(1, dt * 2));
      look.current.lerp(HOME_LOOK, Math.min(1, dt * 2));
      camera.lookAt(look.current);
      return;
    }

    if (!moving.current) {
      moving.current = true;
      startPos.current.copy(camera.position);
      startLook.current.copy(look.current);
    }
    const p = Math.min(1, (t - openedAt.current - EXIT_DELAY) / EXIT_DURATION);
    const k = easeInOut(p);
    camera.position.lerpVectors(startPos.current, EXIT_POS, k);
    look.current.lerpVectors(startLook.current, EXIT_LOOK, k);
    camera.lookAt(look.current);
    if (p >= 1 && !done.current) {
      done.current = true;
      onExitRef.current?.();
    }
  });
  return null;
}

/** Bright "light at the end of the tunnel" box behind the doorway, seen through the door. */
function ExitGlow() {
  return (
    <mesh position={[0, 1.95, -4.15]}>
      <boxGeometry args={[3.1, 3.9, 3.7]} />
      <meshBasicMaterial color="#fffbe6" side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

/** Owns its own <Canvas>. Fills its parent element. */
export function LevelScene({ level, guardState, speech, doorOpen, onDoorClick, onExitComplete }: LevelSceneProps) {
  const info = getLevel(level);
  const Decor = DECOR[info.decor];
  const isPassphrase = info.winMode === 'passphrase';
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 1.8, 5], fov: 55, near: 0.1, far: 200 }}
      style={{ width: '100%', height: '100%' }}
    >
      <hemisphereLight args={['#ffffff', '#5a4a3a', 1.1]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 8, 6]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-4}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
      />
      <Suspense fallback={null}>
        <Decor key={info.decor} />
      </Suspense>
      <ExitGlow />
      <Suspense fallback={null}>
        <Door
          open={doorOpen}
          frameColor={info.doorColor}
          showKeypad={isPassphrase}
          onClick={isPassphrase ? onDoorClick : undefined}
          position={[0, 0, -2]}
        />
      </Suspense>
      <Suspense fallback={null}>
        <Guard look={info.look} state={guardState} speech={speech} name={info.guardName} position={[0, 0, -0.6]} />
      </Suspense>
      <CameraRig level={level} doorOpen={doorOpen} onExitComplete={onExitComplete} />
    </Canvas>
  );
}
