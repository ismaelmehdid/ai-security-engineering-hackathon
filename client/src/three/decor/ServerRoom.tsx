import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Room } from './Room';
import { Sign } from './parts';

const LED_COLORS = ['#39ff14', '#00e5ff', '#ffb000', '#ff3b3b'];

function ServerRack({ position }: { position: [number, number, number] }) {
  const leds = useRef<(THREE.Mesh | null)[]>([]);
  const layout = useMemo(() => {
    const out: { x: number; y: number; color: string }[] = [];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 4; col++) {
        out.push({
          x: -0.3 + col * 0.12,
          y: 0.35 + row * 0.22,
          color: LED_COLORS[(row * 7 + col * 3) % (col === 3 ? 4 : 3)],
        });
      }
    }
    return out;
  }, []);
  useFrame(() => {
    for (const led of leds.current) {
      if (led && Math.random() < 0.06) led.visible = !led.visible;
    }
  });
  return (
    <group position={position}>
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 2.4, 0.9]} />
        <meshStandardMaterial color="#12181f" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* drive bays */}
      {Array.from({ length: 9 }, (_, row) => (
        <mesh key={row} position={[0.12, 0.35 + row * 0.22, 0.455]}>
          <boxGeometry args={[0.6, 0.16, 0.02]} />
          <meshStandardMaterial color="#2a3542" />
        </mesh>
      ))}
      {layout.map((l, i) => (
        <mesh
          key={i}
          ref={(m) => {
            leds.current[i] = m;
          }}
          position={[l.x, l.y, 0.47]}
        >
          <boxGeometry args={[0.06, 0.06, 0.02]} />
          <meshStandardMaterial color={l.color} emissive={l.color} emissiveIntensity={2.5} toneMapped={false} />
        </mesh>
      ))}
      {/* top vent */}
      <mesh position={[0, 2.42, 0]}>
        <boxGeometry args={[0.9, 0.04, 0.8]} />
        <meshStandardMaterial color="#39434f" />
      </mesh>
    </group>
  );
}

function Cable({ points, color }: { points: [number, number, number][]; color: string }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, 40, 0.05, 8, false);
  }, [points]);
  return (
    <mesh geometry={geo} castShadow>
      <meshToonMaterial color={color} />
    </mesh>
  );
}

function Fan({ position }: { position: [number, number, number] }) {
  const blades = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    if (blades.current) blades.current.rotation.z += dt * 18;
    if (head.current) head.current.rotation.y = -0.6 + Math.sin(clock.elapsedTime * 0.7) * 0.6;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.4, 0.1, 20]} />
        <meshToonMaterial color="#e8e8e8" />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.2, 10]} />
        <meshToonMaterial color="#cccccc" />
      </mesh>
      <group ref={head} position={[0, 1.3, 0]}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.42, 0.03, 8, 32]} />
          <meshToonMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0, -0.1]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshToonMaterial color="#9ad0ff" />
        </mesh>
        <group ref={blades} position={[0, 0, 0.02]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} position={[0, 0, 0]}>
              <boxGeometry args={[0.1, 0.72, 0.02]} />
              <meshToonMaterial color="#58b4ff" />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

export function ServerRoom() {
  const cables = useMemo(
    () => [
      { color: '#ff3b3b', points: [[-2.3, 2.4, -1.4], [-2.2, 3.4, -1.7], [-3.5, 3.6, -1.85], [-5.2, 3.3, -1.85]] as [number, number, number][] },
      { color: '#ffd23f', points: [[-3.6, 2.4, -1.4], [-3.8, 3.1, -1.6], [-4.8, 3.9, -1.85], [-5.8, 4.5, -1.85]] as [number, number, number][] },
      { color: '#3fa9ff', points: [[3.6, 2.4, -1.4], [3.9, 3.3, -1.7], [4.8, 3.6, -1.85], [5.8, 3.0, -1.85]] as [number, number, number][] },
      { color: '#39ff14', points: [[4.9, 0.05, -0.8], [4.4, 0.05, 0.3], [5.0, 0.05, 1.2], [5.8, 0.05, 1.6]] as [number, number, number][] },
      { color: '#ff7ad9', points: [[-3.5, 0.05, -0.8], [-4.2, 0.05, 0.2], [-3.4, 0.05, 1.0], [-5.6, 0.05, 2.0]] as [number, number, number][] },
    ],
    [],
  );
  return (
    <group>
      <Room floorColor="#1f2a36" wallColor="#243447" background="#0d141c" />
      {/* floor grid tiles */}
      <gridHelper args={[12, 12, '#3b5a7a', '#2c4058']} position={[0, 0.01, 3]} />
      <ServerRack position={[-2.35, 0, -1.4]} />
      <ServerRack position={[-3.6, 0, -1.4]} />
      <ServerRack position={[3.6, 0, -1.4]} />
      <ServerRack position={[4.9, 0, -1.4]} />
      {cables.map((c, i) => (
        <Cable key={i} points={c.points} color={c.color} />
      ))}
      <Fan position={[3.5, 0, 0.1]} />
      {/* cold blue mood lights */}
      <pointLight position={[-3.5, 3, 0]} color="#3fa9ff" intensity={8} distance={8} />
      <pointLight position={[4, 3, 0]} color="#39ff14" intensity={5} distance={7} />
      <Sign text="AUTHORIZED NERDS ONLY" position={[0, 4.15, -1.94]} width={3.9} height={0.75} board="#39ff14" fontSize={0.3} />
      <Sign text="Have you tried turning the guard off and on again?" position={[4.3, 4.3, -1.94]} width={2.6} height={0.6} board="#ffffff" fontSize={0.13} />
    </group>
  );
}
