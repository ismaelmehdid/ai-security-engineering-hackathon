import { Suspense, useEffect, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

export interface DoorProps {
  open: boolean;
  frameColor: string;
  showKeypad: boolean;
  onClick?: () => void;
  position?: [number, number, number];
}

const PANEL_W = 2.2;
const PANEL_H = 3.2;
const PANEL_D = 0.12;
/** Positive y rotation swings the free (+x) edge toward -z, away from the camera. */
const OPEN_ANGLE = 1.75;

const RIVETS: [number, number][] = [];
for (const x of [-0.98, 0.98]) for (let i = 0; i < 6; i++) RIVETS.push([x, -1.45 + i * 0.58]);
for (const y of [-1.47, 1.47]) for (let i = 1; i < 5; i++) RIVETS.push([-0.98 + i * 0.392, y]);

const KEYS: [number, number][] = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) KEYS.push([(c - 1) * 0.08, -0.03 - r * 0.075]);

/** Must be rendered inside a react-three-fiber <Canvas>. */
export function Door({ open, frameColor, showKeypad, onClick, position = [0, 0, -2] }: DoorProps) {
  const hinge = useRef<THREE.Group>(null!);
  const screen = useRef<THREE.MeshStandardMaterial>(null!);

  useFrame(({ clock }, delta) => {
    const target = open ? OPEN_ANGLE : 0;
    const a = 1 - Math.exp(-5 * Math.min(delta, 0.1)); // ~0.8 s to settle
    hinge.current.rotation.y += (target - hinge.current.rotation.y) * a;
    if (screen.current) {
      const t = clock.elapsedTime;
      screen.current.emissiveIntensity = open ? 2.2 : 0.9 + 0.8 * (0.5 + 0.5 * Math.sin(t * 4));
    }
  });

  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );

  const clickable = !!onClick;
  const handlers = clickable
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick?.();
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          document.body.style.cursor = '';
        },
      }
    : {};

  return (
    <group position={position}>
      {/* Frame */}
      <mesh position={[-1.2, 1.7, 0]}>
        <boxGeometry args={[0.2, 3.4, 0.3]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>
      <mesh position={[1.2, 1.7, 0]}>
        <boxGeometry args={[0.2, 3.4, 0.3]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>
      <mesh position={[0, 3.3, 0]}>
        <boxGeometry args={[2.6, 0.2, 0.3]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>

      {/* Glowing doorway behind the panel */}
      <mesh position={[0, PANEL_H / 2, -0.3]}>
        <planeGeometry args={[PANEL_W, PANEL_H]} />
        <meshBasicMaterial color="#fffbe6" toneMapped={false} />
      </mesh>

      {/* Panel, hinged on its left edge */}
      <group ref={hinge} position={[-PANEL_W / 2, 0, 0]}>
        <group position={[PANEL_W / 2, PANEL_H / 2, 0]}>
          <mesh {...handlers}>
            <boxGeometry args={[PANEL_W, PANEL_H, PANEL_D]} />
            <meshStandardMaterial color="#4a4f57" metalness={0.6} roughness={0.45} />
          </mesh>
          {/* Rivets */}
          {RIVETS.map(([x, y], i) => (
            <mesh key={i} position={[x, y, PANEL_D / 2]}>
              <sphereGeometry args={[0.035, 8, 6]} />
              <meshStandardMaterial color="#8a9099" metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
          {/* Hazard stripe band */}
          <mesh position={[0, -1.05, PANEL_D / 2 + 0.005]}>
            <planeGeometry args={[1.8, 0.28]} />
            <meshStandardMaterial color="#f4d03f" />
          </mesh>
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={`s${i}`} position={[-0.78 + i * 0.26, -1.05, PANEL_D / 2 + 0.01]} rotation={[0, 0, 0.6]}>
              <planeGeometry args={[0.09, 0.33]} />
              <meshStandardMaterial color="#111" />
            </mesh>
          ))}
          {/* NO ENTRY sign */}
          <mesh position={[0, 1.22, PANEL_D / 2 + 0.01]}>
            <boxGeometry args={[1.35, 0.46, 0.02]} />
            <meshStandardMaterial color="#d62828" />
          </mesh>
          <Suspense fallback={null}>
            <Text
              position={[0, 1.22, PANEL_D / 2 + 0.03]}
              fontSize={0.26}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.01}
              outlineColor="#000"
            >
              NO ENTRY
            </Text>
          </Suspense>
          {/* Handle wheel */}
          <group position={[0.72, -0.1, PANEL_D / 2 + 0.05]}>
            <mesh>
              <torusGeometry args={[0.14, 0.025, 8, 20]} />
              <meshStandardMaterial color="#b0b6be" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.28, 0.03, 0.03]} />
              <meshStandardMaterial color="#b0b6be" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh rotation={[0, 0, -Math.PI / 4]}>
              <boxGeometry args={[0.28, 0.03, 0.03]} />
              <meshStandardMaterial color="#b0b6be" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Keypad */}
      {showKeypad && (
        <group position={[1.58, 1.72, 0.2]} {...handlers}>
          <mesh>
            <boxGeometry args={[0.3, 0.45, 0.08]} />
            <meshStandardMaterial color="#2b2f36" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.13, 0.045]}>
            <planeGeometry args={[0.22, 0.1]} />
            <meshStandardMaterial ref={screen} color="#0b3d1c" emissive="#2ecc71" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
          {KEYS.map(([x, y], i) => (
            <mesh key={i} position={[x, y, 0.045]}>
              <boxGeometry args={[0.055, 0.05, 0.02]} />
              <meshStandardMaterial color="#d9dde3" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
