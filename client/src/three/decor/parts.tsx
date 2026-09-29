import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

/** A tiled two-color checker texture (nearest filtering, so tiles stay crisp). */
export function useCheckerTexture(a: string, b: string, repeatX: number, repeatY: number) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 2, 2);
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillRect(1, 1, 1, 1);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [a, b, repeatX, repeatY]);
}

interface SignProps {
  text: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  board?: string;
  border?: string;
  color?: string;
  fontSize?: number;
}

/** A chunky wall sign: bordered board with bold text on the front (+z). */
export function Sign({
  text,
  position,
  rotation = [0, 0, 0],
  width = 3,
  height = 0.7,
  board = '#ffd23f',
  border = '#1b1b1b',
  color = '#1b1b1b',
  fontSize = 0.28,
}: SignProps) {
  // Auto-shrink so the text always fits inside the board (rough glyph width = 0.62 em).
  const maxW = width - 0.2;
  let size = fontSize;
  const lines = (fs: number) => Math.ceil((text.length * 0.62 * fs) / maxW);
  while (size > 0.05 && lines(size) * size * 1.25 > height - 0.06) size *= 0.92;
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.01]}>
        <boxGeometry args={[width + 0.14, height + 0.14, 0.05]} />
        <meshToonMaterial color={border} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[width, height, 0.04]} />
        <meshToonMaterial color={board} />
      </mesh>
      <Text
        position={[0, 0, 0.05]}
        fontSize={size}
        color={color}
        anchorX="center"
        anchorY="middle"
        maxWidth={maxW}
        textAlign="center"
        fontWeight="bold"
      >
        {text}
      </Text>
    </group>
  );
}
