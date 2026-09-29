import type { Texture } from 'three';

interface RoomProps {
  floorColor: string;
  wallColor: string;
  /** Optional floor texture (e.g. checker). Tinted by floorColor. */
  floorMap?: Texture;
  /** Trim along the bottom of the walls. */
  trimColor?: string;
  /** Scene background color (seen only through gaps). */
  background?: string;
  wallHeight?: number;
}

const DOOR_W = 2.2;
const DOOR_H = 3.2;
const WALL_T = 0.2;

/**
 * Shared room shell. Floor 12x10 spanning z in [-2, 8], back wall at z = -2 with a
 * 2.2 x 3.2 door hole centered at x = 0 (three boxes around the hole), side walls at x = +/-6.
 */
export function Room({
  floorColor,
  wallColor,
  floorMap,
  trimColor = '#000000',
  background = '#101018',
  wallHeight = 6,
}: RoomProps) {
  const sideW = 6 - DOOR_W / 2; // width of each back-wall piece beside the door
  const topH = wallHeight - DOOR_H;
  const z = -2 - WALL_T / 2; // front face of back wall sits at z = -2
  return (
    <group>
      <color attach="background" args={[background]} />
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 3]} receiveShadow>
        <planeGeometry args={[12, 10]} />
        <meshStandardMaterial color={floorMap ? '#ffffff' : floorColor} map={floorMap ?? null} roughness={0.85} />
      </mesh>
      {/* back wall: left, right, top pieces around the door hole */}
      <mesh position={[-(DOOR_W / 2 + sideW / 2), wallHeight / 2, z]} receiveShadow>
        <boxGeometry args={[sideW, wallHeight, WALL_T]} />
        <meshStandardMaterial color={wallColor} roughness={0.9} />
      </mesh>
      <mesh position={[DOOR_W / 2 + sideW / 2, wallHeight / 2, z]} receiveShadow>
        <boxGeometry args={[sideW, wallHeight, WALL_T]} />
        <meshStandardMaterial color={wallColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, DOOR_H + topH / 2, z]} receiveShadow>
        <boxGeometry args={[DOOR_W, topH, WALL_T]} />
        <meshStandardMaterial color={wallColor} roughness={0.9} />
      </mesh>
      {/* side walls */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (6 + WALL_T / 2), wallHeight / 2, 3]} receiveShadow>
          <boxGeometry args={[WALL_T, wallHeight, 10]} />
          <meshStandardMaterial color={wallColor} roughness={0.9} />
        </mesh>
      ))}
      {/* chunky baseboard trim */}
      <mesh position={[-(DOOR_W / 2 + sideW / 2) - 0.05, 0.12, -1.98]}>
        <boxGeometry args={[sideW - 0.1, 0.24, 0.06]} />
        <meshStandardMaterial color={trimColor} transparent opacity={0.3} />
      </mesh>
      <mesh position={[DOOR_W / 2 + sideW / 2 + 0.05, 0.12, -1.98]}>
        <boxGeometry args={[sideW - 0.1, 0.24, 0.06]} />
        <meshStandardMaterial color={trimColor} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}
