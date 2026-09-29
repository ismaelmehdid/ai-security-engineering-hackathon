import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { GuardLook } from '../../../shared/levels';
import type { GuardState } from '../../../shared/types';
import './guard.css';

export interface GuardProps {
  look: GuardLook;
  state: GuardState;
  speech: string | null;
  name: string;
  position?: [number, number, number];
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const SHOULDER_X = 0.9;
const SHOULDER_Y = 1.8;
const UPPER_LEN = 0.62; // shoulder pivot -> elbow pivot
const HEAD_Y = 2.3;
const HEAD_R = 0.28;
const EYE_X = 0.1;
const ANGRY_RED = new THREE.Color('#ff3b3b');
const DOWN = new THREE.Vector3(0, -1, 0);
const TEAR_COUNT = 5;
const PUFF_COUNT = 3;

/** Frame-rate independent smoothing factor. */
function k(lambda: number, delta: number) {
  return 1 - Math.exp(-lambda * Math.min(delta, 0.1));
}
function damp(current: number, target: number, lambda: number, delta: number) {
  return current + (target - current) * k(lambda, delta);
}

// ---------------------------------------------------------------------------
// Arm poses. Directions are in body space for the arm on the +x side;
// the -x arm mirrors x. `upper` = shoulder->elbow, `fore` = elbow->fist.
// ---------------------------------------------------------------------------

interface ArmPose {
  upper: V3;
  fore: V3;
}

function armPose(state: GuardState, side: 1 | -1, t: number): ArmPose {
  switch (state) {
    case 'idle': {
      // Arms crossed over the chest. The -x forearm sits a little higher/forward.
      const hi = side === -1 ? 0.14 : 0;
      return { upper: [0.12, -0.62, 0.78], fore: [-1, 0.06 + hi, 0.2 + hi] };
    }
    case 'thinking':
      if (side === 1) {
        // Scratching the head, forearm wiggles.
        return {
          upper: [0.3, 0.72, 0.62],
          fore: [-0.85 + 0.18 * Math.sin(t * 16), 0.3 + 0.12 * Math.sin(t * 16 + 1), -0.35],
        };
      }
      // Hand on hip.
      return { upper: [0.78, -0.62, -0.05], fore: [-0.78, -0.62, 0.15] };
    case 'talking': {
      const ph = side === 1 ? 0 : 1.7;
      return {
        upper: [0.5, -0.85, 0.3 + 0.1 * Math.sin(t * 3 + ph)],
        fore: [0.1 + 0.25 * Math.sin(t * 2.3 + ph), -0.05 + 0.45 * Math.sin(t * 4.5 + ph), 1],
      };
    }
    case 'angry': {
      // Double bicep flex, trembling with rage.
      const tr = 0.04 * Math.sin(t * 38 + side);
      return { upper: [1, 0.15 + tr, 0.12], fore: [-0.28, 1, 0.08 + tr] };
    }
    case 'broken': {
      // Fists up at the cheeks, sobbing and shaking.
      const sh = 0.09 * Math.sin(t * 24 + side * 2);
      return { upper: [-0.4, -0.45, 0.8], fore: [-0.42 + sh, 0.62, -0.1] };
    }
  }
}

const tmpUpper = new THREE.Vector3();
const tmpFore = new THREE.Vector3();
const tmpQ1 = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpInv = new THREE.Quaternion();

function applyArm(
  shoulder: THREE.Group,
  elbow: THREE.Group,
  pose: ArmPose,
  side: 1 | -1,
  alpha: number,
) {
  tmpUpper.set(pose.upper[0] * side, pose.upper[1], pose.upper[2]).normalize();
  tmpFore.set(pose.fore[0] * side, pose.fore[1], pose.fore[2]).normalize();
  tmpQ1.setFromUnitVectors(DOWN, tmpUpper);
  tmpQ2.setFromUnitVectors(DOWN, tmpFore);
  shoulder.quaternion.slerp(tmpQ1, alpha);
  // Elbow is a child of the shoulder: local = inverse(shoulder) * world.
  tmpInv.copy(shoulder.quaternion).invert();
  tmpQ2.premultiply(tmpInv);
  elbow.quaternion.slerp(tmpQ2, alpha);
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function useGuardMaterials(look: GuardLook) {
  const mats = useMemo(() => {
    const toon = (color: string) => new THREE.MeshToonMaterial({ color });
    return {
      shirt: toon(look.shirt),
      skin: toon(look.skin),
      face: toon(look.skin),
      pants: toon(look.pants),
      shoe: toon('#111111'),
      pupil: new THREE.MeshBasicMaterial({ color: '#111111' }),
      white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      brow: toon('#2b1b0e'),
      mouth: toon('#5a1a1a'),
      mouthInside: new THREE.MeshBasicMaterial({ color: '#3a0808' }),
      tear: new THREE.MeshBasicMaterial({ color: '#4fc3f7' }),
      steam: new THREE.MeshBasicMaterial({ color: '#f4f4f4' }),
      blush: new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0 }),
      glasses: toon('#0a0a0a'),
      gold: new THREE.MeshStandardMaterial({ color: '#f5c542', metalness: 0.8, roughness: 0.25 }),
      grey: toon('#9aa0a6'),
      mustache: toon('#3b2412'),
      capCloth: toon('#23395d'),
      beret: toon('#1e1e1e'),
      hardhat: toon('#f4d03f'),
      helmet: toon('#2c3e50'),
    };
  }, [look.shirt, look.skin, look.pants]);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

type Mats = ReturnType<typeof useGuardMaterials>;

// ---------------------------------------------------------------------------
// Hats and accessories (head-local coordinates, head center = origin)
// ---------------------------------------------------------------------------

function Hat({ kind, mats }: { kind: GuardLook['hat']; mats: Mats }) {
  switch (kind) {
    case 'cap':
      return (
        <group>
          <mesh position={[0, 0.09, 0]} scale={[1, 0.72, 1]} material={mats.capCloth}>
            <sphereGeometry args={[0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, 0.1, 0.27]} rotation={[0.18, 0, 0]} material={mats.capCloth}>
            <boxGeometry args={[0.34, 0.025, 0.22]} />
          </mesh>
          <mesh position={[0, 0.2, 0.2]} rotation={[-0.55, 0, 0]} material={mats.gold}>
            <cylinderGeometry args={[0.045, 0.045, 0.015, 6]} />
          </mesh>
        </group>
      );
    case 'beret':
      return (
        <group position={[0.04, 0.2, -0.02]} rotation={[0, 0, 0.32]}>
          <mesh scale={[1.12, 0.34, 1.12]} material={mats.beret}>
            <sphereGeometry args={[0.3, 20, 12]} />
          </mesh>
          <mesh position={[0, 0.1, 0]} material={mats.beret}>
            <cylinderGeometry args={[0.015, 0.015, 0.06, 6]} />
          </mesh>
        </group>
      );
    case 'hardhat':
      return (
        <group position={[0, 0.07, 0]}>
          <mesh material={mats.hardhat}>
            <sphereGeometry args={[0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, 0.01, 0.03]} material={mats.hardhat}>
            <cylinderGeometry args={[0.4, 0.4, 0.025, 24]} />
          </mesh>
          <mesh position={[0, 0.3, 0]} scale={[0.25, 1, 1]} material={mats.hardhat}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
        </group>
      );
    case 'helmet':
      return (
        <group position={[0, 0.17, 0]}>
          <mesh material={mats.helmet}>
            <sphereGeometry args={[0.315, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.helmet}>
            <torusGeometry args={[0.315, 0.022, 8, 28]} />
          </mesh>
          <mesh position={[0, 0.2, 0.2]} rotation={[-0.8, 0, 0]} material={mats.gold}>
            <boxGeometry args={[0.09, 0.07, 0.02]} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Overlay: a tiny, StrictMode-safe replacement for drei <Html>.
// drei's Html reuses one DOM element across StrictMode remounts and unmounts
// its React root synchronously, which races in React 19 (content vanishes,
// removeChild errors). This one makes a fresh element per mount and defers
// the unmount. Fixed CSS pixel size (no distance scaling).
// ---------------------------------------------------------------------------

const projV = new THREE.Vector3();

function Overlay({
  position,
  children,
  keepOnScreen = false,
}: {
  position: V3;
  children: ReactNode;
  /** Clamp so an upward-growing bubble never leaves the canvas. */
  keepOnScreen?: boolean;
}) {
  const anchor = useRef<THREE.Group>(null!);
  const holder = useRef<{ el: HTMLDivElement; root: Root } | null>(null);
  const { gl, camera, size, events } = useThree();
  const target = (events.connected as HTMLElement | null | undefined) ?? gl.domElement.parentElement;

  useLayoutEffect(() => {
    if (!target) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:30;display:none;';
    target.appendChild(el);
    const root = createRoot(el);
    holder.current = { el, root };
    return () => {
      holder.current = null;
      el.remove();
      setTimeout(() => root.unmount(), 0);
    };
  }, [target]);

  useLayoutEffect(() => {
    holder.current?.root.render(children);
  });

  useFrame(() => {
    const h = holder.current;
    if (!h || !anchor.current) return;
    projV.setFromMatrixPosition(anchor.current.matrixWorld).project(camera);
    if (projV.z > 1 || projV.z < -1) {
      h.el.style.display = 'none';
      return;
    }
    let x = (projV.x * 0.5 + 0.5) * size.width;
    let y = (-projV.y * 0.5 + 0.5) * size.height;
    const box = h.el.firstElementChild as HTMLElement | null;
    if (keepOnScreen && box) {
      const w = box.offsetWidth;
      const bh = box.offsetHeight + 12; // anchor sits 12px above the point
      x = Math.min(Math.max(x, w / 2 + 6), Math.max(w / 2 + 6, size.width - w / 2 - 6));
      y = Math.max(y, bh + 6);
    }
    h.el.style.display = 'block';
    h.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
  });

  return <group ref={anchor} position={position} />;
}

// ---------------------------------------------------------------------------
// The Guard
// ---------------------------------------------------------------------------

/** Must be rendered inside a react-three-fiber <Canvas>. */
export function Guard({ look, state, speech, name, position = [0, 0, -0.6] }: GuardProps) {
  const mats = useGuardMaterials(look);
  const skinColor = useMemo(() => new THREE.Color(look.skin), [look.skin]);
  const shirtColor = useMemo(() => new THREE.Color(look.shirt), [look.shirt]);
  const shirtAngry = useMemo(() => shirtColor.clone().lerp(ANGRY_RED, 0.35), [shirtColor]);
  const faceAngry = useMemo(() => skinColor.clone().lerp(ANGRY_RED, 0.85), [skinColor]);

  const mover = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const shoulderL = useRef<THREE.Group>(null!);
  const shoulderR = useRef<THREE.Group>(null!);
  const elbowL = useRef<THREE.Group>(null!);
  const elbowR = useRef<THREE.Group>(null!);
  const bicepL = useRef<THREE.Mesh>(null!);
  const bicepR = useRef<THREE.Mesh>(null!);
  const browL = useRef<THREE.Mesh>(null!);
  const browR = useRef<THREE.Mesh>(null!);
  const eyeL = useRef<THREE.Group>(null!);
  const eyeR = useRef<THREE.Group>(null!);
  const mouthArc = useRef<THREE.Mesh>(null!);
  const mouthOpen = useRef<THREE.Mesh>(null!);
  const mouth = useRef<THREE.Group>(null!);
  const teeth = useRef<THREE.Mesh>(null!);
  const sweat = useRef<THREE.Group>(null!);
  const glasses = useRef<THREE.Group>(null!);
  const tears = useRef<(THREE.Mesh | null)[]>([]);
  const puffs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const broken = state === 'broken';
    const angry = state === 'angry';
    const thinking = state === 'thinking';
    const talking = state === 'talking';
    const a8 = k(8, delta);
    const a14 = k(14, delta);

    // --- whole guard: step aside + shrink when broken ---------------------
    const m = mover.current;
    m.position.x = damp(m.position.x, broken ? 1.8 : 0, 4, delta);
    m.rotation.y = damp(m.rotation.y, broken ? -0.35 : 0, 4, delta);
    const targetScale = look.scale * (broken ? 0.8 : 1);
    const s = damp(body.current.scale.x, targetScale, 4, delta);
    body.current.scale.setScalar(s);
    // Rage tremble / sob jitter on the body.
    body.current.position.x = angry ? 0.012 * Math.sin(t * 45) : broken ? 0.01 * Math.sin(t * 31) : 0;
    body.current.position.y = angry ? Math.abs(Math.sin(t * 6)) * 0.03 : 0;

    // --- torso: breathing, sobbing heave ---------------------------------
    let breathe = 1 + 0.02 * Math.sin(t * 1.6);
    if (broken) breathe = 1 + 0.035 * Math.sin(t * 9);
    if (angry) breathe = 1.04 + 0.02 * Math.sin(t * 10);
    torso.current.scale.y = damp(torso.current.scale.y, breathe, 12, delta);
    torso.current.scale.x = damp(torso.current.scale.x, angry ? 1.05 : 1, 6, delta);

    // --- colors ----------------------------------------------------------
    mats.face.color.lerp(angry ? faceAngry : skinColor, k(3, delta));
    mats.shirt.color.lerp(angry ? shirtAngry : shirtColor, k(3, delta));
    mats.blush.opacity = damp(mats.blush.opacity, broken ? 0.8 : 0, 3, delta);

    // --- arms ------------------------------------------------------------
    applyArm(shoulderR.current, elbowR.current, armPose(state, 1, t), 1, a8);
    applyArm(shoulderL.current, elbowL.current, armPose(state, -1, t), -1, a8);

    // Biceps: idle flex pulse every ~4 s; angry = pumped.
    let bicep = 1;
    if (state === 'idle') {
      const ph = (t % 4) / 4;
      bicep = ph < 0.25 ? 1 + 0.22 * Math.sin((ph / 0.25) * Math.PI) : 1;
    } else if (angry) {
      bicep = 1.35 + 0.06 * Math.sin(t * 12);
    } else if (broken) {
      bicep = 0.85;
    }
    const bs = damp(bicepR.current.scale.x, bicep, 10, delta);
    bicepR.current.scale.set(bs, bs * 1.3, bs);
    bicepL.current.scale.set(bs, bs * 1.3, bs);

    // --- legs: knees shake when broken ------------------------------------
    const knee = broken ? 0.12 * Math.sin(t * 34) : 0;
    legL.current.rotation.z = damp(legL.current.rotation.z, knee, 20, delta);
    legR.current.rotation.z = damp(legR.current.rotation.z, -knee, 20, delta);

    // --- head ------------------------------------------------------------
    const h = head.current;
    let hy = HEAD_Y;
    let hrx = 0;
    let hrz = 0;
    if (talking) {
      hy += 0.025 * Math.sin(t * 9);
      hrx = 0.08 * Math.sin(t * 4.5);
    } else if (thinking) {
      hrz = 0.18;
      hrx = -0.15;
    } else if (angry) {
      hrx = 0.12;
      hrz = 0.02 * Math.sin(t * 40);
    } else if (broken) {
      hy -= 0.03 + 0.02 * Math.sin(t * 9);
      hrx = -0.05;
      hrz = 0.12 * Math.sin(t * 2.2);
    }
    h.position.y = damp(h.position.y, hy, 12, delta);
    h.rotation.x = damp(h.rotation.x, hrx, 8, delta);
    h.rotation.z = damp(h.rotation.z, hrz, 8, delta);

    // --- eyebrows (rotation z, inner end down = angry) --------------------
    let browAngle = 0.35;
    let browRaiseR = 0;
    let browRaiseL = 0;
    let browAngleR: number | null = null;
    if (talking) browAngle = 0.25;
    if (angry) browAngle = 0.55 + 0.05 * Math.sin(t * 30);
    if (thinking) {
      browAngleR = -0.1;
      browRaiseR = 0.05;
      browAngle = 0.3;
    }
    if (broken) {
      browAngle = -0.42 + 0.06 * Math.sin(t * 7);
      browRaiseL = browRaiseR = 0.035;
    }
    browR.current.rotation.z = damp(browR.current.rotation.z, browAngleR ?? browAngle, 10, delta);
    browL.current.rotation.z = damp(browL.current.rotation.z, -browAngle, 10, delta);
    browR.current.position.y = damp(browR.current.position.y, 0.13 + browRaiseR, 10, delta);
    browL.current.position.y = damp(browL.current.position.y, 0.13 + browRaiseL, 10, delta);

    // --- eyes -------------------------------------------------------------
    // Children: [0] white, [1] pupil, [2] sparkle.
    for (const eye of [eyeL.current, eyeR.current]) {
      const big = broken ? 2.6 : 1;
      const sy = angry ? 0.4 : big;
      eye.scale.x = damp(eye.scale.x, big, 6, delta);
      eye.scale.y = damp(eye.scale.y, sy, 8, delta);
      eye.scale.z = damp(eye.scale.z, big, 6, delta);
      const [white, pupil, sparkle] = eye.children as THREE.Mesh[];
      const ws = damp(white.scale.x, broken ? 1 : 0.001, 6, delta);
      white.scale.setScalar(ws);
      sparkle.scale.setScalar(ws);
      const ps = damp(pupil.scale.x, broken ? 0.72 : 1, 6, delta);
      pupil.scale.setScalar(ps);
      pupil.position.z = damp(pupil.position.z, broken ? 0.028 : 0, 6, delta);
      pupil.position.y = damp(pupil.position.y, thinking ? 0.02 : broken ? -0.006 : 0, 8, delta);
      // Glossy wobble.
      sparkle.position.x = 0.014 + (broken ? 0.003 * Math.sin(t * 13) : 0);
    }

    // --- mouth ------------------------------------------------------------
    let arcY = 1;
    let arcX = 1;
    let arcRot = 0;
    let open = 0.05;
    let mouthY = -0.14;
    if (talking) {
      open = 0.25 + 0.75 * Math.abs(Math.sin(t * 8 * Math.PI * 0.5));
      arcY = 1 + 1.2 * Math.abs(Math.sin(t * 8 * Math.PI * 0.5));
    } else if (thinking) {
      arcY = 0.12;
      arcX = 0.8;
    } else if (angry) {
      arcX = 1.25;
      arcY = 1.1;
    } else if (broken) {
      arcX = 1.25;
      arcY = 1.5 + 0.35 * Math.sin(t * 28);
      arcRot = 0.12 * Math.sin(t * 17);
      open = 0.25 + 0.1 * Math.sin(t * 28);
      mouthY = -0.155;
    }
    mouthArc.current.scale.x = damp(mouthArc.current.scale.x, arcX, 20, delta);
    mouthArc.current.scale.y = damp(mouthArc.current.scale.y, arcY, 20, delta);
    mouth.current.rotation.z = damp(mouth.current.rotation.z, arcRot, 20, delta);
    mouth.current.position.y = damp(mouth.current.position.y, mouthY, 10, delta);
    mouthOpen.current.scale.y = damp(mouthOpen.current.scale.y, open, 25, delta);
    teeth.current.scale.setScalar(damp(teeth.current.scale.x, angry ? 1 : 0.001, 12, delta));

    // --- sweat drop (thinking) -------------------------------------------
    const sw = sweat.current;
    const swPh = (t % 1.6) / 1.6;
    sw.position.y = 0.16 - swPh * 0.3;
    sw.scale.setScalar(damp(sw.scale.x, thinking ? 1 : 0.001, 10, delta));

    // --- sunglasses fall off when broken --------------------------------
    if (glasses.current) {
      const g = glasses.current;
      g.position.y = damp(g.position.y, broken ? -2.15 : 0, broken ? 2.5 : 6, delta);
      g.position.x = damp(g.position.x, broken ? 0.35 : 0, 3, delta);
      g.position.z = damp(g.position.z, broken ? 0.35 : 0, 3, delta);
      g.rotation.z = damp(g.rotation.z, broken ? 2.6 : 0, 3, delta);
      g.rotation.x = damp(g.rotation.x, broken ? -1.3 : 0, 3, delta);
    }

    // --- tears (broken) --------------------------------------------------
    tears.current.forEach((tear, i) => {
      if (!tear) return;
      const eyeSide = i % 2 === 0 ? 1 : -1;
      const n = Math.floor(i / 2);
      const ph = ((t * 1.4 + n / TEAR_COUNT) % 1 + 1) % 1;
      // Cartoon fountain tears: squirt outward in an arc, then fall.
      tear.position.set(
        eyeSide * (EYE_X + 0.08 + ph * 0.45),
        0.0 + 0.3 * ph - 1.1 * ph * ph,
        0.22 + ph * 0.1,
      );
      const vis = broken ? Math.sin(Math.min(ph * 5, 1) * Math.PI * 0.5) * (1.1 - ph * 0.5) : 0;
      tear.scale.setScalar(Math.max(vis, 0.001));
    });

    // --- steam puffs (angry) ---------------------------------------------
    puffs.current.forEach((puff, i) => {
      if (!puff) return;
      const earSide = i % 2 === 0 ? 1 : -1;
      const n = Math.floor(i / 2);
      const ph = ((t * 1.1 + n / PUFF_COUNT) % 1 + 1) % 1;
      puff.position.set(earSide * (0.32 + ph * 0.3), 0.02 + ph * 0.55, -0.02);
      const vis = angry ? Math.sin(ph * Math.PI) * (0.7 + ph * 0.8) : 0;
      puff.scale.setScalar(Math.max(vis, 0.001));
    });
  });

  const showSpeech = speech !== null && speech.trim() !== '' && state !== 'thinking';
  const bubbleScale = look.scale * (state === 'broken' ? 0.8 : 1);
  const bubbleClass = [
    'speech-bubble',
    state === 'angry' ? 'speech-bubble--angry' : '',
    state === 'broken' ? 'speech-bubble--sad' : '',
    speech && speech.length > 170 ? 'speech-bubble--long' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const arm = (side: 1 | -1) => {
    const shoulderRef = side === 1 ? shoulderR : shoulderL;
    const elbowRef = side === 1 ? elbowR : elbowL;
    const bicepRef = side === 1 ? bicepR : bicepL;
    return (
      <group key={side}>
        {/* Deltoid ball (in the shirt). */}
        <mesh position={[side * SHOULDER_X, SHOULDER_Y, 0]} material={mats.shirt}>
          <sphereGeometry args={[0.35, 20, 16]} />
        </mesh>
        <group ref={shoulderRef} position={[side * (SHOULDER_X + 0.05), SHOULDER_Y - 0.05, 0]}>
          <mesh ref={bicepRef} position={[0, -0.3, 0]} scale={[1, 1.3, 1]} material={mats.skin}>
            <sphereGeometry args={[0.31, 20, 16]} />
          </mesh>
          <group ref={elbowRef} position={[0, -UPPER_LEN, 0]}>
            <mesh position={[0, -0.2, 0]} material={mats.skin}>
              <capsuleGeometry args={[0.18, 0.3, 6, 12]} />
            </mesh>
            <mesh position={[0, -0.52, 0]} material={mats.skin}>
              <sphereGeometry args={[0.21, 16, 12]} />
            </mesh>
          </group>
        </group>
      </group>
    );
  };

  return (
    <group position={position}>
      <group ref={mover}>
        <group ref={body} scale={look.scale}>
          {/* Legs (tiny) and shoes */}
          {([-1, 1] as const).map((side) => (
            <group key={side} ref={side === -1 ? legL : legR} position={[side * 0.25, 0.62, 0]}>
              <mesh position={[0, -0.27, 0]} material={mats.pants}>
                <capsuleGeometry args={[0.17, 0.45, 6, 12]} />
              </mesh>
              <mesh position={[0, -0.54, 0.08]} material={mats.shoe}>
                <boxGeometry args={[0.32, 0.16, 0.46]} />
              </mesh>
            </group>
          ))}
          {/* Belt */}
          <mesh position={[0, 0.66, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.72, 1]} material={mats.pants}>
            <cylinderGeometry args={[0.5, 0.5, 0.22, 24]} />
          </mesh>

          {/* Torso (barrel) */}
          <group ref={torso} position={[0, 1.35, 0]}>
            {/* Chest (wide) */}
            <mesh position={[0, 0.22, 0]} scale={[1.32, 0.8, 0.8]} material={mats.shirt}>
              <sphereGeometry args={[0.75, 28, 20]} />
            </mesh>
            {/* Belly / waist (narrower) */}
            <mesh position={[0, -0.3, 0.02]} scale={[0.88, 0.78, 0.7]} material={mats.shirt}>
              <sphereGeometry args={[0.75, 24, 18]} />
            </mesh>
            {/* Pecs */}
            {([-1, 1] as const).map((side) => (
              <mesh key={side} position={[side * 0.3, 0.3, 0.46]} scale={[1.15, 0.78, 0.6]} material={mats.shirt}>
                <sphereGeometry args={[0.34, 20, 14]} />
              </mesh>
            ))}
            <Suspense fallback={null}>
              <Text
                position={[0, -0.12, 0.545]}
                fontSize={0.15}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.012}
                outlineColor="#000000"
                letterSpacing={0.06}
              >
                SECURITY
              </Text>
            </Suspense>
          </group>
          {/* Traps: the neck is buried in muscle */}
          {([-1, 1] as const).map((side) => (
            <mesh key={side} position={[side * 0.42, 1.93, -0.02]} scale={[1.25, 0.8, 0.95]} material={mats.shirt}>
              <sphereGeometry args={[0.3, 16, 12]} />
            </mesh>
          ))}

          {arm(-1)}
          {arm(1)}

          {/* Neck */}
          <mesh position={[0, 2.05, 0]} material={mats.face}>
            <cylinderGeometry args={[0.18, 0.2, 0.18, 16]} />
          </mesh>
          {look.accessory === 'goldchain' && (
            <group position={[0, 1.98, 0.02]} rotation={[Math.PI / 2 - 0.45, 0, 0]}>
              <mesh material={mats.gold}>
                <torusGeometry args={[0.3, 0.03, 8, 28]} />
              </mesh>
              <mesh position={[0, 0.3, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={mats.gold}>
                <cylinderGeometry args={[0.09, 0.09, 0.025, 20]} />
              </mesh>
            </group>
          )}

          {/* Head (tiny) */}
          <group ref={head} position={[0, HEAD_Y, 0]} scale={1.15}>
            <mesh material={mats.face}>
              <sphereGeometry args={[HEAD_R, 24, 18]} />
            </mesh>
            {/* Ears */}
            {([-1, 1] as const).map((side) => (
              <mesh key={side} position={[side * 0.275, 0, 0]} scale={[0.5, 1, 0.8]} material={mats.face}>
                <sphereGeometry args={[0.07, 10, 8]} />
              </mesh>
            ))}
            {/* Nose */}
            <mesh position={[0, -0.04, 0.275]} material={mats.face}>
              <sphereGeometry args={[0.05, 12, 10]} />
            </mesh>
            {/* Eyes: white (broken only), pupil, sparkle (broken only) */}
            {([-1, 1] as const).map((side) => (
              <group key={side} ref={side === -1 ? eyeL : eyeR} position={[side * EYE_X, 0.035, 0.24]}>
                <mesh scale={0.001} material={mats.white}>
                  <sphereGeometry args={[0.05, 16, 12]} />
                </mesh>
                <mesh material={mats.pupil}>
                  <sphereGeometry args={[0.042, 14, 10]} />
                </mesh>
                <mesh position={[0.014, 0.016, 0.062]} scale={0.001} material={mats.white}>
                  <sphereGeometry args={[0.012, 8, 6]} />
                </mesh>
              </group>
            ))}
            {/* Blush (broken) */}
            {([-1, 1] as const).map((side) => (
              <mesh key={side} position={[side * 0.17, -0.08, 0.215]} rotation={[0, side * 0.6, 0]} scale={[1, 0.6, 0.3]} material={mats.blush}>
                <sphereGeometry args={[0.05, 12, 8]} />
              </mesh>
            ))}
            {/* Eyebrows */}
            <mesh ref={browL} position={[-EYE_X, 0.13, 0.25]} rotation={[0, 0, -0.35]} material={mats.brow}>
              <boxGeometry args={[0.18, 0.05, 0.05]} />
            </mesh>
            <mesh ref={browR} position={[EYE_X, 0.13, 0.25]} rotation={[0, 0, 0.35]} material={mats.brow}>
              <boxGeometry args={[0.18, 0.05, 0.05]} />
            </mesh>
            {/* Mouth: frown arc + open part + gritted teeth */}
            <group ref={mouth} position={[0, -0.14, 0.255]}>
              <mesh ref={mouthArc} material={mats.mouth}>
                <torusGeometry args={[0.07, 0.017, 8, 20, Math.PI]} />
              </mesh>
              <mesh ref={mouthOpen} position={[0, 0.02, -0.005]} scale={[0.9, 0.05, 0.35]} material={mats.mouthInside}>
                <sphereGeometry args={[0.06, 14, 10]} />
              </mesh>
              <mesh ref={teeth} position={[0, 0.035, 0.012]} scale={0.001} material={mats.white}>
                <boxGeometry args={[0.13, 0.04, 0.015]} />
              </mesh>
            </group>

            {look.accessory === 'mustache' &&
              ([-1, 1] as const).map((side) => (
                <mesh
                  key={side}
                  position={[side * 0.065, -0.085, 0.27]}
                  rotation={[0, 0, side * -0.35]}
                  scale={[1.5, 0.55, 0.6]}
                  material={mats.mustache}
                >
                  <sphereGeometry args={[0.06, 12, 8]} />
                </mesh>
              ))}
            {look.accessory === 'earpiece' && (
              <group position={[0.29, 0, 0]}>
                <mesh material={mats.grey}>
                  <sphereGeometry args={[0.04, 10, 8]} />
                </mesh>
                <mesh position={[0.01, -0.2, -0.03]} material={mats.grey}>
                  <cylinderGeometry args={[0.009, 0.009, 0.38, 6]} />
                </mesh>
                <mesh position={[0.02, -0.08, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={mats.grey}>
                  <torusGeometry args={[0.03, 0.007, 6, 14]} />
                </mesh>
              </group>
            )}
            {look.accessory === 'sunglasses' && (
              <group ref={glasses}>
                {([-1, 1] as const).map((side) => (
                  <mesh key={side} position={[side * 0.1, 0.035, 0.275]} material={mats.glasses}>
                    <boxGeometry args={[0.14, 0.075, 0.03]} />
                  </mesh>
                ))}
                {([-1, 1] as const).map((side) => (
                  <mesh key={`g${side}`} position={[side * 0.07, 0.05, 0.293]} rotation={[0, 0, 0.7]} material={mats.white}>
                    <boxGeometry args={[0.012, 0.05, 0.004]} />
                  </mesh>
                ))}
                <mesh position={[0, 0.05, 0.28]} material={mats.glasses}>
                  <boxGeometry args={[0.07, 0.018, 0.02]} />
                </mesh>
                {([-1, 1] as const).map((side) => (
                  <mesh key={`t${side}`} position={[side * 0.2, 0.05, 0.13]} rotation={[0, side * 0.45, 0]} material={mats.glasses}>
                    <boxGeometry args={[0.015, 0.018, 0.3]} />
                  </mesh>
                ))}
              </group>
            )}

            <Hat kind={look.hat} mats={mats} />

            {/* Sweat drop (thinking) */}
            <group ref={sweat} position={[0.22, 0.16, 0.16]} scale={0.001}>
              <mesh material={mats.tear}>
                <sphereGeometry args={[0.04, 12, 10]} />
              </mesh>
              <mesh position={[0, 0.045, 0]} material={mats.tear}>
                <coneGeometry args={[0.034, 0.06, 12]} />
              </mesh>
            </group>

            {/* Tears (broken) */}
            {Array.from({ length: TEAR_COUNT * 2 }, (_, i) => (
              <mesh
                key={`tear${i}`}
                ref={(el) => {
                  tears.current[i] = el;
                }}
                scale={0.001}
                material={mats.tear}
              >
                <sphereGeometry args={[0.055, 10, 8]} />
              </mesh>
            ))}

            {/* Steam puffs (angry) */}
            {Array.from({ length: PUFF_COUNT * 2 }, (_, i) => (
              <mesh
                key={`puff${i}`}
                ref={(el) => {
                  puffs.current[i] = el;
                }}
                scale={0.001}
                material={mats.steam}
              >
                <sphereGeometry args={[0.1, 12, 10]} />
              </mesh>
            ))}
          </group>
        </group>

        {/* Speech / thought bubbles (always mounted; content toggles) */}
        <Overlay position={[0, 2.95 * bubbleScale, 0]} keepOnScreen>
          {showSpeech ? (
            <div className="guard-bubble-anchor">
              <div key={speech} className={bubbleClass}>
                {speech}
              </div>
            </div>
          ) : null}
        </Overlay>
        <Overlay position={[0.35 * bubbleScale, 2.9 * bubbleScale, 0]} keepOnScreen>
          {state === 'thinking' ? (
            <div className="guard-bubble-anchor">
              <div className="thought-bubble">
                <span className="thought-dot" />
                <span className="thought-dot" />
                <span className="thought-dot" />
              </div>
            </div>
          ) : null}
        </Overlay>
        <Overlay position={[0, -0.05, 0.3]}>
          <div className="guard-name-anchor">
            <div className={`guard-name${state === 'broken' ? ' guard-name--broken' : ''}`}>{name}</div>
          </div>
        </Overlay>
      </group>
    </group>
  );
}
