import { timingSafeEqual } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../shared/types';
import type { Game, GameStore } from './game';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type S = Socket<ClientToServerEvents, ServerToClientEvents>;
interface SocketData { gameId?: string; role?: 'host' | 'player'; playerId?: string }

const safeAck = <T>(ack: unknown): ((r: T) => void) => (typeof ack === 'function' ? (ack as (r: T) => void) : () => {});
const fail = (error: string) => ({ ok: false as const, error });
/** Payload fields come from untrusted JSON: anything that is not a string becomes ''. */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** Constant-time comparison for secrets such as the host token. */
function secretEquals(given: unknown, expected: string): boolean {
  const a = Buffer.from(str(given));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerSockets(io: IO, store: GameStore): void {
  const pushHost = (game: Game) => io.to(`host:${game.id}`).emit('host:state', game.hostState());
  const pushPlayer = (game: Game, playerId: string) => io.to(`player:${playerId}`).emit('player:state', game.playerState(playerId));
  const pushAllPlayers = (game: Game) => { for (const id of game.players.keys()) pushPlayer(game, id); };

  io.on('connection', (socket: S) => {
    const data = socket.data as SocketData;
    const hostGame = (): Game | undefined => (data.role === 'host' && data.gameId ? store.get(data.gameId) : undefined);
    const playerCtx = (): { game: Game; playerId: string } | undefined => {
      if (data.role !== 'player' || !data.gameId || !data.playerId) return undefined;
      const game = store.get(data.gameId);
      return game ? { game, playerId: data.playerId } : undefined;
    };

    socket.on('host:join', (p, ackRaw) => {
      const ack = safeAck<Ack<{ state: ReturnType<Game['hostState']> }>>(ackRaw);
      const game = store.get(str(p?.gameId));
      if (!game) return ack(fail('Game not found'));
      if (!secretEquals(p?.hostToken, game.hostToken)) return ack(fail('Wrong host token'));
      Object.assign(data, { gameId: game.id, role: 'host' });
      socket.join(`host:${game.id}`);
      ack({ ok: true, state: game.hostState() });
    });

    socket.on('host:start', (ackRaw) => {
      const ack = safeAck<Ack>(ackRaw);
      const game = hostGame();
      if (!game) return ack(fail('Not the host'));
      const r = game.start();
      ack(r);
      if (r.ok) { pushAllPlayers(game); pushHost(game); }
    });

    socket.on('host:end', (ackRaw) => {
      const ack = safeAck<Ack>(ackRaw);
      const game = hostGame();
      if (!game) return ack(fail('Not the host'));
      const r = game.end();
      ack(r);
      if (r.ok) {
        io.to(`game:${game.id}`).emit('game:ended', { podium: game.podium() });
        pushAllPlayers(game);
        pushHost(game);
      }
    });

    socket.on('player:join', (p, ackRaw) => {
      const ack = safeAck<Ack<{ playerId: string; playerToken: string; state: ReturnType<Game['playerState']> }>>(ackRaw);
      const game = store.get(str(p?.gameId));
      if (!game) return ack(fail('Game not found'));
      const r = game.join(str(p?.name), typeof p?.playerToken === 'string' ? p.playerToken : undefined);
      if (!r.ok) return ack(r);
      Object.assign(data, { gameId: game.id, role: 'player', playerId: r.player.id });
      socket.join([`game:${game.id}`, `player:${r.player.id}`]);
      game.setConnected(r.player.id, true);
      ack({ ok: true, playerId: r.player.id, playerToken: r.player.token, state: game.playerState(r.player.id) });
      // game:ended is broadcast once; a player who (re)joins after the end still needs the podium.
      if (game.status === 'ended') socket.emit('game:ended', { podium: game.podium() });
      pushHost(game);
    });

    socket.on('player:message', async (p, ackRaw) => {
      const ack = safeAck<Ack>(ackRaw);
      const ctx = playerCtx();
      if (!ctx) return ack(fail('Join a game first'));
      if (typeof p?.text !== 'string') return ack(fail('Bad message'));
      const { game, playerId } = ctx;
      const room = `player:${playerId}`;
      let acked = false;
      try {
        const r = await game.sendMessage(playerId, p.text, () => {
          acked = true;
          ack({ ok: true });
          io.to(room).emit('guard:thinking');
          pushPlayer(game, playerId);
        });
        if (!r.ok) return ack(r);
        if (r.reply) io.to(room).emit('guard:reply', r.reply);
        if (r.cleared) io.to(room).emit('level:cleared', r.cleared);
        pushPlayer(game, playerId);
        pushHost(game);
      } catch (err) {
        console.error('[sockets] player:message failed:', err);
        if (!acked) ack(fail('Something went wrong, try again'));
        else pushPlayer(game, playerId);
      }
    });

    socket.on('player:passphrase', (p, ackRaw) => {
      const ack = safeAck<Ack<{ correct: boolean }>>(ackRaw);
      const ctx = playerCtx();
      if (!ctx) return ack(fail('Join a game first'));
      const { game, playerId } = ctx;
      const r = game.submitPassphrase(playerId, str(p?.guess));
      if (!r.ok) return ack(r);
      if (r.cleared) {
        io.to(`player:${playerId}`).emit('level:cleared', r.cleared);
        pushPlayer(game, playerId);
        pushHost(game);
      }
      ack({ ok: true, correct: r.correct });
    });

    socket.on('player:plugin', (p, ackRaw) => {
      const ack = safeAck<Ack>(ackRaw);
      const ctx = playerCtx();
      if (!ctx) return ack(fail('Join a game first'));
      const r = ctx.game.installPlugin(ctx.playerId, { name: str(p?.name), description: str(p?.description) });
      ack(r);
      if (r.ok) pushPlayer(ctx.game, ctx.playerId);
    });

    socket.on('disconnect', async () => {
      const ctx = playerCtx();
      if (!ctx) return;
      try {
        const others = await io.in(`player:${ctx.playerId}`).fetchSockets();
        if (others.length === 0) { ctx.game.setConnected(ctx.playerId, false); pushHost(ctx.game); }
      } catch (err) {
        console.error('[sockets] disconnect failed:', err);
      }
    });
  });
}
