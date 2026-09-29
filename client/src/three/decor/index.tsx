import type { JSX } from 'react';
import type { DecorId } from '../../../../shared/levels';
import { Lobby } from './Lobby';
import { ServerRoom } from './ServerRoom';
import { Vault } from './Vault';
import { ControlRoom } from './ControlRoom';
import { Rooftop } from './Rooftop';

/** Each decor component is rendered inside the level <Canvas>. */
export const DECOR: Record<DecorId, () => JSX.Element | null> = {
  lobby: Lobby,
  serverRoom: ServerRoom,
  vault: Vault,
  controlRoom: ControlRoom,
  rooftop: Rooftop,
};
