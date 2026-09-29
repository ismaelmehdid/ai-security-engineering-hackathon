import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { Room } from './Room';
import { Sign } from './parts';

const GOLD = '#ffc629';

function GoldStack({ position, rows = 3 }: { position: [number, number, number]; rows?: number }) {
  const bars = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let r = 0; r < rows; r++) {
      const n = rows - r;
      for (let i = 0; i < n; i++) {
        out.push([(i - (n - 1) / 2) * 0.46, 0.09 + r * 0.18, r % 2 ? 0.02 : 0]);
      }
    }
    return out;
  }, [rows]);
  return (
    <group position={position}>
      {bars.map((p, i) => (
        <mesh key={i} position={p} rotation={[0, Math.PI / 4, 0]} scale={[1.25, 1, 0.85]} castShadow>
          {/* 4-sided cylinder = trapezoid ingot */}
          <cylinderGeometry args={[0.2, 0.27, 0.17, 4, 1]} />
          <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.25} emissive="#7a5200" emissiveIntensity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function MoneyBag({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.42, 0]} scale={[1, 0.95, 0.9]} castShadow>
        <sphereGeometry args={[0.45, 20, 16]} />
        <meshToonMaterial color="#c9a36b" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.1, 0.16, 0.14, 12]} />
        <meshToonMaterial color="#a8834f" />
      </mesh>
      <mesh position={[0, 0.98, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.03, 8, 16]} />
        <meshToonMaterial color="#6b4a1f" />
      </mesh>
      <Text position={[0, 0.45, 0.42]} fontSize={0.42} color="#2e7d32" fontWeight="bold" anchorX="center" anchorY="middle">
        $
      </Text>
    </group>
  );
}

/** Pulsing red laser lines drawn on a side wall (x = side * 5.88). */
function LaserGrid({ side }: { side: 1 | -1 }) {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ff1a1a', emissive: '#ff1a1a', emissiveIntensity: 2, toneMapped: false }),
    [],
  );
  useFrame(({ clock }) => {
    mat.emissiveIntensity = 2 + Math.sin(clock.elapsedTime * 5 + side) * 1.5;
  });
  const lines = useMemo(() => {
    const out: { y: number; z: number; rot: number; len: number }[] = [];
    for (let i = 0; i < 6; i++) out.push({ y: 0.5 + i * 0.5, z: 0.6, rot: i % 2 ? 0.35 : -0.35, len: 5.2 });
    return out;
  }, []);
  return (
    <group position={[side * 5.88, 0, 0]}>
      {lines.map((l, i) => (
        <mesh key={i} position={[0, l.y, l.z]} rotation={[l.rot, 0, 0]} material={mat}>
          <boxGeometry args={[0.02, 0.035, l.len]} />
        </mesh>
      ))}
    </group>
  );
}

/** Lasers across the back-wall sections beside the door. */
function BackLasers() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const k = 0.5 + Math.sin(clock.elapsedTime * 5) * 0.5;
    group.current.children.forEach((c) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 1 + k * 2.5;
    });
  });
  return (
    <group ref={group}>
      {[-1, 1].map((s) =>
        [0.6, 1.2, 1.8].map((y) => (
          <mesh key={`${s}-${y}`} position={[s * 3.8, y, -1.92]} rotation={[0, 0, s * 0.12]}>
            <boxGeometry args={[3.6, 0.035, 0.02]} />
            <meshStandardMaterial color="#ff1a1a" emissive="#ff1a1a" emissiveIntensity={2} toneMapped={false} />
          </mesh>
        )),
      )}
    </group>
  );
}

function SecurityCamera({ position }: { position: [number, number, number] }) {
  const head = useRef<THREE.Group>(null);
  const led = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (head.current) head.current.rotation.y = Math.sin(t * 0.8) * 0.7;
    if (led.current) led.current.visible = Math.floor(t * 2) % 2 === 0;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[0.2, 0.2, 0.16]} />
        <meshStandardMaterial color="#cfcfcf" />
      </mesh>
      <mesh position={[0, -0.1, 0.25]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
        <meshStandardMaterial color="#9a9a9a" />
      </mesh>
      <group ref={head} position={[0, -0.25, 0.3]}>
        <mesh position={[0, 0, 0.15]} castShadow>
          <boxGeometry args={[0.3, 0.26, 0.6]} />
          <meshToonMaterial color="#f2f2f2" />
        </mesh>
        <mesh position={[0, 0, 0.47]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.12, 0.08, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh ref={led} position={[0.1, 0.1, 0.46]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={3} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function VaultWheel({ position }: { position: [number, number, number] }) {
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.z += dt * 0.3;
  });
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.12, 32]} />
        <meshStandardMaterial color="#8a8f98" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.07]}>
        <torusGeometry args={[0.8, 0.06, 10, 32]} />
        <meshStandardMaterial color="#5d626b" metalness={0.7} roughness={0.35} />
      </mesh>
      <group ref={wheel} position={[0, 0, 0.14]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
            <boxGeometry args={[1.1, 0.07, 0.07]} />
            <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.1, 16]} />
          <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

export function Vault() {
  return (
    <group>
      <Room floorColor="#2c2c2c" wallColor="#3b3b3b" background="#141414" />
      {/* diamond-plate-ish floor stripes */}
      {[-4, -2.5].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, 0.5]}>
          <planeGeometry args={[0.25, 5]} />
          <meshToonMaterial color="#ffd23f" />
        </mesh>
      ))}
      <GoldStack position={[-3.4, 0, -1.0]} rows={4} />
      <GoldStack position={[-4.9, 0, 0.4]} rows={3} />
      <GoldStack position={[4.3, 0, -1.1]} rows={4} />
      <MoneyBag position={[3.6, 0, 1.0]} />
      <MoneyBag position={[4.6, 0, 1.5]} scale={0.8} />
      <MoneyBag position={[-2.5, 0, 1.2]} scale={0.7} />
      <LaserGrid side={-1} />
      <LaserGrid side={1} />
      <BackLasers />
      <SecurityCamera position={[-2.3, 3.6, -2.0]} />
      <VaultWheel position={[3.9, 3.0, -1.93]} />
      <pointLight position={[0, 3, 1]} color="#ffcf66" intensity={6} distance={9} />
      <Sign text="VAULT: NO TOUCHY" position={[0, 4.15, -1.94]} width={3.4} height={0.75} board="#ff4d4d" color="#ffffff" fontSize={0.34} />
    </group>
  );
}
