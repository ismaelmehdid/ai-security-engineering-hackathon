import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Room } from './Room';
import { Sign } from './parts';

/** Fake "code + charts" stripes texture that scrolls upward on every monitor. */
function useScreenTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#061018';
    ctx.fillRect(0, 0, 64, 128);
    const colors = ['#39ff14', '#00e5ff', '#ffd23f', '#ff5cf4', '#ff3b3b'];
    for (let y = 2; y < 128; y += 6) {
      let x = 3;
      while (x < 58) {
        const w = 4 + Math.floor(Math.random() * 18);
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.fillRect(x, y, Math.min(w, 61 - x), 3);
        x += w + 3;
        if (Math.random() < 0.25) break;
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

function MonitorWall({ x0, cols, rows, tex }: { x0: number; cols: number; rows: number; tex: THREE.Texture }) {
  const tints = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    tints.current.forEach((m, i) => {
      if (m) m.color.setHSL((t * 0.05 + i * 0.17) % 1, 0.6, 0.75);
    });
  });
  const cells: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
  return (
    <group position={[x0, 1.5, -1.9]}>
      {cells.map(([c, r], i) => (
        <group key={i} position={[c * 1.05, r * 0.8, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.0, 0.75, 0.12]} />
            <meshStandardMaterial color="#0b0f14" />
          </mesh>
          <mesh position={[0, 0, 0.065]}>
            <planeGeometry args={[0.88, 0.63]} />
            <meshBasicMaterial
              ref={(m) => {
                if (m) tints.current[i] = m;
              }}
              map={tex}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function LeverDesk({ position }: { position: [number, number, number] }) {
  const levers = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    levers.current.forEach((l, i) => {
      if (l) l.rotation.x = Math.sin(t * (1.2 + i * 0.4) + i) * 0.5;
    });
  });
  const knobColors = ['#ff3b3b', '#ffd23f', '#39ff14', '#3fa9ff'];
  return (
    <group position={position} rotation={[0, 0.35, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.9, 1.0]} />
        <meshToonMaterial color="#3d4f63" />
      </mesh>
      {/* slanted console top */}
      <mesh position={[0, 0.95, 0]} rotation={[-0.35, 0, 0]} castShadow>
        <boxGeometry args={[2.0, 0.1, 1.0]} />
        <meshToonMaterial color="#56708c" />
      </mesh>
      {knobColors.map((c, i) => (
        <group
          key={i}
          ref={(g) => {
            levers.current[i] = g;
          }}
          position={[-0.7 + i * 0.45, 1.02, 0.05]}
        >
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
            <meshStandardMaterial color="#cccccc" metalness={0.6} />
          </mesh>
          <mesh position={[0, 0.42, 0]} castShadow>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshToonMaterial color={c} />
          </mesh>
        </group>
      ))}
      {/* blinky buttons */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[-0.75 + i * 0.3, 0.98, 0.38]} rotation={[-0.35, 0, 0]}>
          <boxGeometry args={[0.12, 0.04, 0.08]} />
          <meshStandardMaterial color={knobColors[i % 4]} emissive={knobColors[i % 4]} emissiveIntensity={1.5} />
        </mesh>
      ))}
    </group>
  );
}

function BigRedButton({ position }: { position: [number, number, number] }) {
  const button = useRef<THREE.MeshStandardMaterial>(null);
  const top = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (button.current) button.current.emissiveIntensity = 0.6 + (Math.sin(t * 4) * 0.5 + 0.5) * 1.6;
    if (top.current) top.current.scale.y = 1 + Math.sin(t * 4) * 0.08;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.45, 1.0, 24]} />
        <meshToonMaterial color="#e6e6e6" />
      </mesh>
      {/* hazard ring */}
      <mesh position={[0, 1.02, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.06, 24]} />
        <meshToonMaterial color="#ffd23f" />
      </mesh>
      <mesh ref={top} position={[0, 1.12, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.16, 24]} />
        <meshStandardMaterial ref={button} color="#ff1a1a" emissive="#ff0000" emissiveIntensity={1} />
      </mesh>
      {/* the sign on a stick */}
      <mesh position={[0.55, 0.75, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.5, 8]} />
        <meshToonMaterial color="#8b5a2b" />
      </mesh>
      <Sign text="DO NOT PRESS" position={[0.55, 1.6, 0.03]} rotation={[0, -0.3, 0.08]} width={1.1} height={0.4} board="#ffffff" color="#d00000" fontSize={0.15} />
    </group>
  );
}

export function ControlRoom() {
  const tex = useScreenTexture();
  useFrame((_, dt) => {
    tex.offset.y -= dt * 0.15;
  });
  return (
    <group>
      <Room floorColor="#15202b" wallColor="#1c2b3a" background="#0a1118" />
      <gridHelper args={[12, 24, '#23405e', '#1b3149']} position={[0, 0.01, 3]} />
      <MonitorWall x0={-5.4} cols={3} rows={3} tex={tex} />
      <MonitorWall x0={3.3} cols={3} rows={3} tex={tex} />
      <LeverDesk position={[-3.6, 0, 1.0]} />
      <BigRedButton position={[3.7, 0, -0.4]} />
      <pointLight position={[-3.5, 3, 0.5]} color="#00e5ff" intensity={6} distance={8} />
      <pointLight position={[3.7, 2.5, 0.3]} color="#ff3b3b" intensity={6} distance={6} />
      <Sign text="MISSION CONTROL (NO MISSIONS)" position={[0, 4.2, -1.94]} width={4} height={0.75} board="#00e5ff" fontSize={0.26} />
    </group>
  );
}
