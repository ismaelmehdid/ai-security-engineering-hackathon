import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';

export interface PlayerAvatarProps {
  name: string;
  mood: 'happy' | 'sad';
  position: [number, number, number];
  color?: string;
  /** Extra height for the name label (lets a crowd stagger labels so they don't overlap). */
  labelLift?: number;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorFromName(name: string): string {
  const h = hashString(name);
  return `hsl(${h % 360}, 75%, 58%)`;
}

const MAX_SAD_LABEL = 16;

/**
 * Name label: 3D text that always faces the camera. (Not drei <Html>: under React 19
 * StrictMode in dev the first <Html> in a canvas can render empty.)
 */
function NameLabel({ name, happy, y }: { name: string; happy: boolean; y: number }) {
  const text = !happy && name.length > MAX_SAD_LABEL ? `${name.slice(0, MAX_SAD_LABEL - 1)}…` : name;
  return (
    <Billboard position={[0, y, 0]}>
      <Suspense fallback={null}>
        <Text
          fontSize={happy ? 0.34 : 0.17}
          color={happy ? '#ffd23f' : '#eef2f8'}
          outlineWidth={happy ? 0.035 : 0.022}
          outlineColor="#111111"
          fontWeight="bold"
          anchorX="center"
          anchorY="bottom"
        >
          {text}
        </Text>
      </Suspense>
    </Billboard>
  );
}

/** Little grey rain cloud with looping drops, floating above a sad avatar's head. */
function RainCloud({ phase }: { phase: number }) {
  const cloud = useRef<THREE.Group>(null);
  const drops = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (cloud.current) cloud.current.position.x = Math.sin(t * 0.8) * 0.06;
    drops.current.forEach((d, i) => {
      if (!d) return;
      const p = (t * 1.1 + i / 3) % 1;
      d.position.y = 1.95 - p * 0.75;
      (d.material as THREE.MeshStandardMaterial).opacity = 1 - p * 0.6;
    });
  });
  return (
    <group>
      <group ref={cloud} position={[0, 2.1, 0]}>
        <mesh position={[-0.2, 0, 0]}>
          <sphereGeometry args={[0.2, 12, 12]} />
          <meshToonMaterial color="#8a93a3" />
        </mesh>
        <mesh position={[0.05, 0.08, 0]}>
          <sphereGeometry args={[0.26, 12, 12]} />
          <meshToonMaterial color="#9aa3b3" />
        </mesh>
        <mesh position={[0.28, -0.02, 0]}>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshToonMaterial color="#8a93a3" />
        </mesh>
      </group>
      {[-0.18, 0.05, 0.25].map((x, i) => (
        <mesh
          key={i}
          ref={(m) => {
            drops.current[i] = m;
          }}
          position={[x, 1.9, 0.05]}
          scale={[0.6, 1.4, 0.6]}
        >
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="#4fa3ff" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Bean-shaped player. Happy = bounce + big smile + sparkly eyes. Sad = sway, frown, tear, rain cloud. */
export function PlayerAvatar({ name, mood, position, color, labelLift = 0 }: PlayerAvatarProps) {
  const body = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const tear = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => (hashString(name) % 1000) / 159, [name]);
  const bodyColor = color ?? colorFromName(name);
  const happy = mood === 'happy';

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (body.current) {
      if (happy) {
        body.current.position.y = Math.abs(Math.sin(t * 5)) * 0.3;
        body.current.rotation.z = Math.sin(t * 2.5) * 0.08;
      } else {
        body.current.position.y = 0;
        body.current.rotation.z = Math.sin(t * 1.1) * 0.08;
      }
    }
    if (armL.current && armR.current) {
      if (happy) {
        // rotation.z < 0 swings the left arm outward/up, > 0 the right arm
        armL.current.rotation.z = -2.4 - Math.sin(t * 10) * 0.35;
        armR.current.rotation.z = 2.4 + Math.sin(t * 10 + 1) * 0.35;
      } else {
        armL.current.rotation.z = -0.15 - Math.sin(t * 1.1) * 0.05;
        armR.current.rotation.z = 0.15 + Math.sin(t * 1.1) * 0.05;
      }
    }
    if (tear.current) {
      const p = (t * 0.6) % 1;
      tear.current.position.y = 0.8 - p * 0.45;
      tear.current.visible = p < 0.9;
    }
  });

  return (
    <group position={position}>
      <group ref={body}>
        {/* bean body */}
        <mesh position={[0, 0.6, 0]} castShadow>
          <capsuleGeometry args={[0.35, 0.5, 8, 20]} />
          <meshToonMaterial color={bodyColor} />
        </mesh>
        {/* belly patch */}
        <mesh position={[0, 0.45, 0.2]} scale={[1, 1.1, 0.6]}>
          <sphereGeometry args={[0.24, 16, 16]} />
          <meshToonMaterial color="#ffffff" transparent opacity={0.35} />
        </mesh>
        {/* eyes */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.13, 0.88, 0.29]}>
            <mesh scale={happy ? 1.1 : 1}>
              <sphereGeometry args={[0.09, 16, 16]} />
              <meshToonMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0, happy ? 0 : -0.025, 0.065]}>
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshBasicMaterial color="#111111" />
            </mesh>
            {happy ? (
              <mesh position={[0.02, 0.025, 0.105]}>
                <sphereGeometry args={[0.018, 8, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            ) : (
              // droopy eyelid: outer end lower
              <mesh position={[0, 0.05, 0.02]} rotation={[0, 0, -s * 0.35]}>
                <boxGeometry args={[0.22, 0.08, 0.14]} />
                <meshToonMaterial color={bodyColor} />
              </mesh>
            )}
          </group>
        ))}
        {/* mouth: smile (U) or frown (n) */}
        <mesh position={[0, happy ? 0.74 : 0.64, 0.33]} rotation={[0, 0, happy ? Math.PI : 0]}>
          <torusGeometry args={[happy ? 0.12 : 0.08, 0.025, 8, 20, Math.PI]} />
          <meshBasicMaterial color="#3a0d0d" />
        </mesh>
        {happy && (
          // blushing cheeks
          [-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.22, 0.74, 0.27]} scale={[1, 0.6, 0.4]}>
              <sphereGeometry args={[0.06, 10, 10]} />
              <meshBasicMaterial color="#ff8fab" />
            </mesh>
          ))
        )}
        {!happy && (
          <mesh ref={tear} position={[0.16, 0.8, 0.36]} scale={[0.8, 1.3, 0.8]}>
            <sphereGeometry args={[0.035, 10, 10]} />
            <meshStandardMaterial color="#4fa3ff" emissive="#1a5fb4" emissiveIntensity={0.4} />
          </mesh>
        )}
        {/* arms (pivot at shoulder) */}
        <group ref={armL} position={[-0.33, 0.75, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.07, 0.25, 4, 10]} />
            <meshToonMaterial color={bodyColor} />
          </mesh>
        </group>
        <group ref={armR} position={[0.33, 0.75, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.07, 0.25, 4, 10]} />
            <meshToonMaterial color={bodyColor} />
          </mesh>
        </group>
      </group>
      {!happy && <RainCloud phase={phase} />}
      <NameLabel name={name} happy={happy} y={(happy ? 1.7 : 1.35) + labelLift} />
    </group>
  );
}
