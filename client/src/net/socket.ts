import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export const socket: GameSocket = io({ autoConnect: true });

/** Default ack timeout for socket requests (ms). */
export const ACK_TIMEOUT = 10_000;
