import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sparkles, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { PodiumEntry } from '../../../shared/types';
import { PlayerAvatar } from './PlayerAvatar';

export interface PodiumSceneProps {
  podium: PodiumEntry[];
}

/** Step layout by podium index: 0 = gold center, 1 = silver left, 2 = bronze right. */
const STEPS = [
  { x: 0, h: 1.2, color: '#ffc629', label: '1' },
  { x: -1.8, h: 0.8, color: '#c9d1dc', label: '2' },
  { x: 1.8, h: 0.5, color: '#d9884a', label: '3' },
] as const;
const STAGE_H = 0.9; // winners stand on a raised stage so the sad crowd never hides them
const STEP_W = 1.7;
const STEP_D = 1.6;
const ROW_SIZE = 8;
const SPACING = 1.1;
const CONFETTI = 100;
const CONFETTI_COLORS = ['#ff4d6d', '#ffd23f', '#3fa9ff', '#39d98a', '#b15cff', '#ff9f1c'];

function Confetti() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bits = useMemo(
    () =>
      Array.from({ length: CONFETTI }, () => ({
        x: (Math.random() - 0.5) * 7,
        y: Math.random() * 8,
        z: (Math.random() - 0.5) * 3,
        speed: 0.8 + Math.random() * 1.2,
        spin: (Math.random() - 0.5) * 8,
        rx: Math.random() * Math.PI,
        ry: Math.random() * Math.PI,
        wobble: Math.random() * Math.PI * 2,
      })),
    [],
  );
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < CONFETTI; i++) m.setColorAt(i, c.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const step = Math.min(dt, 0.05);
    bits.forEach((b, i) => {
      b.y -= b.speed * step;
      b.rx += b.spin * step;
      b.ry += b.spin * 0.7 * step;
      if (b.y < STAGE_H) {
        // respawn at the top
        b.y = 7 + Math.random() * 1.5;
        b.x = (Math.random() - 0.5) * 7;
        b.z = (Math.random() - 0.5) * 3;
      }
      dummy.position.set(b.x + Math.sin(t * 2 + b.wobble) * 0.25, b.y, b.z);
      dummy.rotation.set(b.rx, b.ry, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CONFETTI]}>
      <boxGeometry args={[0.12, 0.02, 0.08]} />
      <meshStandardMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

function Step({ x, h, color, label }: { x: number; h: number; color: string; label: string }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[STEP_W, h, STEP_D]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.35} />
      </mesh>
      {/* chunky dark base trim */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[STEP_W + 0.08, 0.1, STEP_D + 0.08]} />
        <meshToonMaterial color="#1b1b1b" />
      </mesh>
      <Text
        position={[0, h / 2, STEP_D / 2 + 0.01]}
        fontSize={Math.min(0.9, h * 0.8)}
        color="#1b1b1b"
        fontWeight="bold"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

/**
 * Slow auto-orbit of +/-15 degrees around the podium. The camera sits a bit higher than the
 * plan's [0, 4, 11] so the sad crowd in front never hides the winners.
 */
function OrbitRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || size.height === 0) return;
    const aspect = size.width / size.height;
    const wanted = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(30)) / aspect));
    camera.fov = THREE.MathUtils.clamp(wanted, 50, 80);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  useFrame(({ clock }) => {
    const a = Math.sin(clock.elapsedTime * 0.2) * THREE.MathUtils.degToRad(15);
    camera.position.set(Math.sin(a) * 12, 6, Math.cos(a) * 12);
    camera.lookAt(0, 1.5, 2);
  });
  return null;
}

/** Owns its own <Canvas>. Fills its parent element. */
export function PodiumScene({ podium }: PodiumSceneProps) {
  const top = podium.slice(0, 3);
  const rest = podium.slice(3);
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 6, 12], fov: 50 }} style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={['#241a4a']} />
      <hemisphereLight args={['#ffffff', '#3d2c6e', 1.0]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[4, 10, 8]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <spotLight position={[0, 9, 3]} angle={0.45} penumbra={0.6} intensity={60} color="#fff2c4" />
      <OrbitRig />
      {/* stage floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2]} receiveShadow>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#3d2c6e" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[3.2, 3.45, 48]} />
        <meshToonMaterial color="#ffd23f" />
      </mesh>
      {/* back curtain */}
      <mesh position={[0, 4, -3.5]}>
        <planeGeometry args={[26, 10]} />
        <meshStandardMaterial color="#6b1030" roughness={1} />
      </mesh>
      {/* raised stage */}
      <mesh position={[0, STAGE_H / 2, -0.6]} castShadow receiveShadow>
        <boxGeometry args={[8, STAGE_H, 4]} />
        <meshToonMaterial color="#5a3fa0" />
      </mesh>
      <mesh position={[0, STAGE_H + 0.02, -0.6]}>
        <boxGeometry args={[8.1, 0.05, 4.1]} />
        <meshToonMaterial color="#ffd23f" />
      </mesh>
      {[-3, -1.5, 0, 1.5, 3].map((x) => (
        <mesh key={x} position={[x, STAGE_H / 2, 1.41]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color="#fff3b0" emissive="#ffd23f" emissiveIntensity={1.5} toneMapped={false} />
        </mesh>
      ))}
      <group position={[0, STAGE_H, 0]}>
        {STEPS.map((s) => (
          <Suspense key={s.label} fallback={null}>
            <Step {...s} />
          </Suspense>
        ))}
      </group>
      <Suspense fallback={null}>
        <Text
          position={[0, 4.75, -1.2]}
          fontSize={0.95}
          color="#ffd23f"
          outlineWidth={0.06}
          outlineColor="#1b1b1b"
          fontWeight="bold"
          anchorX="center"
          anchorY="middle"
        >
          HALL OF FAME
        </Text>
        {podium.length === 0 && (
          <Text position={[0, 3.6, -1.2]} fontSize={0.35} color="#ffffff" outlineWidth={0.03} outlineColor="#1b1b1b" anchorX="center">
            ...nobody? The guards win this round.
          </Text>
        )}
      </Suspense>
      {top.length > 0 && <Confetti />}
      <Sparkles count={40} scale={[8, 5, 4]} position={[0, 3.6, 0]} size={4} speed={0.4} color="#fff3b0" />
      {top.map((p, i) => (
        <PlayerAvatar key={p.playerId} name={p.name} mood="happy" position={[STEPS[i].x, STAGE_H + STEPS[i].h + 0.06, 0]} />
      ))}
      {rest.map((p, i) => {
        const row = Math.floor(i / ROW_SIZE);
        const inRow = Math.min(ROW_SIZE, rest.length - row * ROW_SIZE);
        const col = i % ROW_SIZE;
        const x = (col - (inRow - 1) / 2) * SPACING;
        return (
          <PlayerAvatar
            key={p.playerId}
            name={p.name}
            mood="sad"
            position={[x, 0, 3.6 + row * 1.15]}
            labelLift={col % 2 ? 0.22 : 0}
          />
        );
      })}
    </Canvas>
  );
}
