import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Sign } from './parts';

const HUT = '#6d6f78';

/**
 * No room walls on the rooftop: the door sits in a small stairwell hut (x in [-1.8, 1.8],
 * z in [-6.2, -2]) so the doorway still leads somewhere during the camera exit move.
 */
function StairwellHut() {
  const depth = 4.2;
  const h = 4;
  const zc = -2 - depth / 2;
  return (
    <group>
      {/* front face pieces around the 2.2 x 3.2 hole */}
      <mesh position={[-1.45, h / 2, -2.1]} castShadow receiveShadow>
        <boxGeometry args={[0.7, h, 0.2]} />
        <meshStandardMaterial color={HUT} />
      </mesh>
      <mesh position={[1.45, h / 2, -2.1]} castShadow receiveShadow>
        <boxGeometry args={[0.7, h, 0.2]} />
        <meshStandardMaterial color={HUT} />
      </mesh>
      <mesh position={[0, 3.6, -2.1]} castShadow>
        <boxGeometry args={[2.2, 0.8, 0.2]} />
        <meshStandardMaterial color={HUT} />
      </mesh>
      {/* sides + roof + back */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.7, h / 2, zc]} castShadow>
          <boxGeometry args={[0.2, h, depth]} />
          <meshStandardMaterial color={HUT} />
        </mesh>
      ))}
      <mesh position={[0, h + 0.1, zc]} castShadow>
        <boxGeometry args={[3.8, 0.2, depth + 0.3]} />
        <meshStandardMaterial color="#4b4d55" />
      </mesh>
      <mesh position={[0, h / 2, -2 - depth]}>
        <boxGeometry args={[3.6, h, 0.2]} />
        <meshStandardMaterial color={HUT} />
      </mesh>
    </group>
  );
}

function Helicopter({ position }: { position: [number, number, number] }) {
  const rotor = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    if (rotor.current) rotor.current.rotation.y += dt * 14;
    if (tail.current) tail.current.rotation.x += dt * 20;
    if (body.current) body.current.position.y = Math.sin(clock.elapsedTime * 9) * 0.01;
  });
  return (
    <group position={position} rotation={[0, 0.9, 0]}>
      <group ref={body}>
        {/* cabin */}
        <mesh position={[0, 0.75, 0]} scale={[1.3, 0.9, 0.9]} castShadow>
          <sphereGeometry args={[0.6, 20, 16]} />
          <meshToonMaterial color="#ff4d4d" />
        </mesh>
        {/* window */}
        <mesh position={[0.45, 0.85, 0]} scale={[0.6, 0.6, 0.85]}>
          <sphereGeometry args={[0.5, 16, 12]} />
          <meshStandardMaterial color="#9fe6ff" metalness={0.3} roughness={0.1} />
        </mesh>
        {/* tail boom */}
        <mesh position={[-1.1, 0.85, 0]} rotation={[0, 0, Math.PI / 2 + 0.08]} castShadow>
          <cylinderGeometry args={[0.07, 0.14, 1.3, 10]} />
          <meshToonMaterial color="#ff4d4d" />
        </mesh>
        <mesh position={[-1.72, 1.05, 0]}>
          <boxGeometry args={[0.2, 0.4, 0.05]} />
          <meshToonMaterial color="#ffd23f" />
        </mesh>
        <group ref={tail} position={[-1.75, 1.05, 0.06]}>
          <mesh>
            <boxGeometry args={[0.04, 0.45, 0.03]} />
            <meshToonMaterial color="#333" />
          </mesh>
        </group>
        {/* skids */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[0, 0.06, s * 0.45]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 1.5, 8]} />
              <meshToonMaterial color="#333" />
            </mesh>
            <mesh position={[0.3, 0.22, s * 0.4]}>
              <cylinderGeometry args={[0.03, 0.03, 0.34, 6]} />
              <meshToonMaterial color="#333" />
            </mesh>
            <mesh position={[-0.3, 0.22, s * 0.4]}>
              <cylinderGeometry args={[0.03, 0.03, 0.34, 6]} />
              <meshToonMaterial color="#333" />
            </mesh>
          </group>
        ))}
        {/* mast + rotor */}
        <mesh position={[0, 1.38, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.2, 8]} />
          <meshToonMaterial color="#333" />
        </mesh>
        <group ref={rotor} position={[0, 1.48, 0]}>
          <mesh>
            <boxGeometry args={[3.0, 0.03, 0.14]} />
            <meshToonMaterial color="#222" />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[3.0, 0.03, 0.14]} />
            <meshToonMaterial color="#222" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Helipad({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[1.65, 40]} />
        <meshToonMaterial color="#3a3d44" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[1.35, 1.55, 40]} />
        <meshToonMaterial color="#ffd23f" />
      </mesh>
      <Text rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} fontSize={1.6} color="#ffffff" fontWeight="bold" anchorX="center" anchorY="middle">
        H
      </Text>
    </group>
  );
}

function Antenna({ position }: { position: [number, number, number] }) {
  const light = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (light.current) light.current.visible = clock.elapsedTime % 1.2 < 0.5;
  });
  const h = 4.2;
  return (
    <group position={position}>
      {[[-0.25, -0.25], [0.25, -0.25], [0, 0.25]].map(([x, z], i) => (
        <mesh key={i} position={[x * 0.5, h / 2, z * 0.5]} rotation={[z * 0.05, 0, -x * 0.05]}>
          <cylinderGeometry args={[0.03, 0.05, h, 6]} />
          <meshStandardMaterial color="#b8bcc4" metalness={0.6} />
        </mesh>
      ))}
      {[0.8, 1.6, 2.4, 3.2].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.16 - y * 0.02, 0.015, 6, 12]} />
          <meshStandardMaterial color="#b8bcc4" metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, h + 0.05, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color="#550000" />
      </mesh>
      <mesh ref={light} position={[0, h + 0.05, 0]}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshStandardMaterial color="#ff2020" emissive="#ff0000" emissiveIntensity={4} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Skyline() {
  const buildings = useMemo(() => {
    const out: { x: number; z: number; w: number; h: number; d: number; lit: string }[] = [];
    const lit = ['#ffd23f', '#9fe6ff', '#ff9ff3'];
    for (let i = 0; i < 22; i++) {
      const x = -44 + i * 4 + (i % 3) * 0.7;
      out.push({ x, z: -26 - (i % 4) * 5, w: 2.5 + (i % 3), h: 3 + ((i * 7) % 9) * 1.4, d: 3, lit: lit[i % 3] });
    }
    return out;
  }, []);
  return (
    <group position={[0, -8, 0]}>
      {buildings.map((b, i) => (
        <group key={i} position={[b.x, b.h / 2, b.z]}>
          <mesh>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color="#1a1f3a" />
          </mesh>
          {/* a few lit windows */}
          {[0.25, 0.55, 0.8].map((f, j) => (
            <mesh key={j} position={[((j % 2) - 0.5) * b.w * 0.4, b.h * (f - 0.5), b.d / 2 + 0.01]}>
              <planeGeometry args={[0.4, 0.5]} />
              <meshBasicMaterial color={b.lit} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Parapet() {
  const c = '#7c7f88';
  return (
    <group>
      {/* back edge beside the hut */}
      <mesh position={[-3.9, 0.35, -2.1]} castShadow>
        <boxGeometry args={[4.2, 0.7, 0.3]} />
        <meshStandardMaterial color={c} />
      </mesh>
      <mesh position={[3.9, 0.35, -2.1]} castShadow>
        <boxGeometry args={[4.2, 0.7, 0.3]} />
        <meshStandardMaterial color={c} />
      </mesh>
      {/* sides */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 6, 0.35, 3]} castShadow>
          <boxGeometry args={[0.3, 0.7, 10.3]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
}

export function Rooftop() {
  return (
    <group>
      <color attach="background" args={['#0b1026']} />
      <Stars radius={60} depth={30} count={3000} factor={4} saturation={0} fade speed={1} />
      {/* roof surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 3]} receiveShadow>
        <planeGeometry args={[12, 10]} />
        <meshStandardMaterial color="#555555" roughness={0.95} />
      </mesh>
      <Parapet />
      <StairwellHut />
      <Helipad position={[-3.5, 0, -0.3]} />
      <group scale={0.85}>
        <Helicopter position={[-3.5 / 0.85, 0, -0.3 / 0.85]} />
      </group>
      <Antenna position={[4.6, 0, -1.3]} />
      {/* AC unit */}
      <group position={[3.6, 0, -0.2]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[1.2, 0.9, 0.9]} />
          <meshToonMaterial color="#c9ccd2" />
        </mesh>
        <mesh position={[0, 0.92, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.35, 20]} />
          <meshToonMaterial color="#555" />
        </mesh>
      </group>
      {/* moon */}
      <mesh position={[-26, 14, -45]}>
        <sphereGeometry args={[3.2, 32, 32]} />
        <meshBasicMaterial color="#fff6d5" toneMapped={false} />
      </mesh>
      <mesh position={[-25, 14.8, -42.2]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color="#e8dcb0" />
      </mesh>
      <pointLight position={[-6, 8, 2]} color="#9fb4ff" intensity={20} distance={20} />
      <Skyline />
      <Sign text="ROOF ACCESS: ABSOLUTELY NOT" position={[0, 4.55, -1.99]} width={3.6} height={0.6} board="#ff9ff3" fontSize={0.25} />
    </group>
  );
}
