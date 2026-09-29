import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Room } from './Room';
import { Sign, useCheckerTexture } from './parts';

const GOLD = '#e8b923';
const RED = '#c0182b';

function RopePost({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.08, 20]} />
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.95, 12]} />
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.25} />
      </mesh>
    </group>
  );
}

function Rope({ from, to }: { from: [number, number]; to: [number, number] }) {
  const geo = useMemo(() => {
    const a = new THREE.Vector3(from[0], 0.95, from[1]);
    const b = new THREE.Vector3(to[0], 0.95, to[1]);
    const mid = a.clone().lerp(b, 0.5);
    mid.y = 0.62;
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, 0.045, 8, false);
  }, [from, to]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={RED} roughness={0.6} />
    </mesh>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  const leaves = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (leaves.current) leaves.current.rotation.z = Math.sin(clock.elapsedTime * 1.3) * 0.05;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.28, 0.7, 20]} />
        <meshToonMaterial color="#d2691e" />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.08, 20]} />
        <meshToonMaterial color="#b85a18" />
      </mesh>
      <group ref={leaves} position={[0, 0.75, 0]}>
        {[
          [0, 0.7, 0, 0.45],
          [0.3, 0.45, 0.1, 0.33],
          [-0.3, 0.5, -0.05, 0.35],
          [0.1, 1.1, -0.1, 0.3],
          [-0.15, 0.95, 0.2, 0.28],
        ].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} castShadow>
            <sphereGeometry args={[r, 14, 14]} />
            <meshToonMaterial color={i % 2 ? '#3fae49' : '#2e8b3a'} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function ReceptionDesk({ position }: { position: [number, number, number] }) {
  const bell = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    // the bell does a tiny impatient "ding" wiggle every few seconds
    const t = clock.elapsedTime % 3.5;
    if (bell.current) bell.current.rotation.z = t < 0.4 ? Math.sin(t * 60) * 0.25 * (1 - t / 0.4) : 0;
  });
  return (
    <group position={position} rotation={[0, -0.35, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 1.1, 0.9]} />
        <meshToonMaterial color="#8b4f2a" />
      </mesh>
      <mesh position={[0, 1.14, 0]} castShadow>
        <boxGeometry args={[2.4, 0.08, 1.05]} />
        <meshToonMaterial color="#5e3219" />
      </mesh>
      {/* front stripe */}
      <mesh position={[0, 0.7, 0.46]}>
        <boxGeometry args={[2.2, 0.16, 0.02]} />
        <meshToonMaterial color={GOLD} />
      </mesh>
      {/* bell */}
      <group ref={bell} position={[0.5, 1.18, 0.15]}>
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.03, 20]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0, 0.02, 0]} castShadow>
          <sphereGeometry args={[0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.17, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.06, 8]} />
          <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.2} />
        </mesh>
      </group>
      {/* a sad little computer */}
      <mesh position={[-0.5, 1.45, -0.1]} castShadow>
        <boxGeometry args={[0.6, 0.45, 0.08]} />
        <meshToonMaterial color="#dddddd" />
      </mesh>
      <mesh position={[-0.5, 1.45, -0.05]}>
        <planeGeometry args={[0.5, 0.35]} />
        <meshBasicMaterial color="#3fc1ff" />
      </mesh>
    </group>
  );
}

export function Lobby() {
  const checker = useCheckerTexture('#e8d5b7', '#c9a978', 6, 5);
  const ropeA = useMemo<[number, number]>(() => [-2.1, 0.6], []);
  const ropeB = useMemo<[number, number]>(() => [-3.5, 1.1], []);
  const ropeC = useMemo<[number, number]>(() => [-4.9, 1.6], []);
  return (
    <group>
      <Room floorColor="#e8d5b7" wallColor="#f4e1c1" floorMap={checker} background="#f4e1c1" />
      {/* velvet rope line (left) */}
      <RopePost x={ropeA[0]} z={ropeA[1]} />
      <RopePost x={ropeB[0]} z={ropeB[1]} />
      <RopePost x={ropeC[0]} z={ropeC[1]} />
      <Rope from={ropeA} to={ropeB} />
      <Rope from={ropeB} to={ropeC} />
      <Plant position={[-4.9, 0, -1.3]} />
      <Plant position={[5.1, 0, -1.35]} />
      <ReceptionDesk position={[4.1, 0, 0.6]} />
      {/* red carpet toward the door (flat, walkable) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.5]} receiveShadow>
        <planeGeometry args={[1.8, 5]} />
        <meshToonMaterial color="#a3162a" />
      </mesh>
      {/* framed portrait of the employee of the month (a fist) */}
      <group position={[-3.6, 2.4, -1.94]}>
        <mesh>
          <boxGeometry args={[1.2, 1.4, 0.06]} />
          <meshToonMaterial color={GOLD} />
        </mesh>
        <mesh position={[0, 0, 0.035]}>
          <planeGeometry args={[1.0, 1.2]} />
          <meshToonMaterial color="#9fd3ff" />
        </mesh>
        <mesh position={[0, -0.05, 0.1]}>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshToonMaterial color="#e0ac69" />
        </mesh>
      </group>
      <Sign text="WELCOME (NOT YOU)" position={[0, 4.15, -1.94]} width={3.6} height={0.75} board="#ffe066" fontSize={0.32} />
      <Sign text="EMPLOYEE OF THE MONTH: BRICK'S FIST" position={[-3.6, 3.45, -1.94]} width={2.2} height={0.4} board="#ffffff" fontSize={0.13} />
    </group>
  );
}
