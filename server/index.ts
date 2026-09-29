import 'dotenv/config';
import express, { type ErrorRequestHandler, type Express, type Request, type RequestHandler } from 'express';
import fs from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types';
import { GameStore } from './game';
import { GUARDS } from './guards';
import { createLlmFromEnv } from './llm';
import { registerSockets } from './sockets';

/**
 * Same-origin by default. Exceptions: Google Fonts (CSS + font files), cdn.jsdelivr.net (troika /
 * drei <Text> fetches its default font there), blob: (troika runs its text worker from a blob URL
 * and importScripts() it), data: (inlined assets, favicon), ws:/wss: (socket.io).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' ws: wss: blob: data: https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
};

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Rate-limit key for a request. In the demo every player arrives through `cloudflared` on this
 * machine, so the peer is loopback and the real client IP is in `cf-connecting-ip`. That header is
 * trusted only from loopback peers; anyone else is keyed by their own socket address.
 */
export function clientKey(req: Request): string {
  const peer = req.socket?.remoteAddress;
  if (!peer) return 'unknown';
  if (LOOPBACK.has(peer) || peer.startsWith('127.')) {
    const cf = req.headers?.['cf-connecting-ip'];
    if (typeof cf === 'string' && isIP(cf.trim()) !== 0) return cf.trim();
  }
  return peer;
}

/** Tiny fixed-window, per-client, in-memory rate limiter. Answers 429 when over the limit. */
export function createRateLimiter(opts: {
  limit: number; windowMs: number; now?: () => number; message?: string; key?: (req: Request) => string;
}): RequestHandler {
  const now = opts.now ?? Date.now;
  const keyOf = opts.key ?? clientKey;
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const t = now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    const key = keyOf(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > opts.limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - t) / 1000))));
      res.status(429).json({ error: opts.message ?? 'Whoa, slow down! Too many requests. Try again in a minute.' });
      return;
    }
    next();
  };
}

const GAME_ID_PARAM = /^[A-Za-z0-9]{1,10}$/;

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const raw = Number((err as { status?: unknown })?.status ?? (err as { statusCode?: unknown })?.statusCode);
  const status = Number.isInteger(raw) && raw >= 400 && raw < 600 ? raw : 500;
  if (status >= 500) console.error('[server] request failed:', err);
  res.status(status).json({ error: status === 413 ? 'Request too large' : status < 500 ? 'Bad request' : 'Something broke' });
};

export function createApp(
  store: GameStore,
  opts: { distDir?: string | null; now?: () => number; apiLimitPerMinute?: number } = {},
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // General limit on the API only: static assets and SPA routes are never throttled.
  app.use('/api', createRateLimiter({ limit: opts.apiLimitPerMinute ?? 600, windowMs: 60_000, now: opts.now }));
  app.use(express.json({ limit: '10kb' }));

  const createLimiter = createRateLimiter({
    limit: 10, windowMs: 60_000, now: opts.now,
    message: 'Whoa, that is a lot of games! Wait a minute before creating another one.',
  });
  app.post('/api/games', createLimiter, (_req, res) => {
    if (store.isFull()) {
      res.status(503).json({ error: 'The building is packed! Too many games right now, try again later.' });
      return;
    }
    const game = store.create();
    res.json({ gameId: game.id, hostToken: game.hostToken });
  });
  app.get('/api/games/:id', (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !GAME_ID_PARAM.test(id)) {
      res.status(400).json({ error: 'Bad game code' });
      return;
    }
    res.json({ exists: Boolean(store.get(id)) });
  });

  const dist = opts.distDir;
  if (dist && fs.existsSync(dist)) {
    app.use(express.static(dist, { dotfiles: 'ignore', index: 'index.html' }));
    // SPA fallback: always the same fixed file, never a path derived from the request.
    app.use((req, res, next) => {
      if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api')) {
        res.sendFile('index.html', { root: dist, dotfiles: 'deny' });
      } else next();
    });
  }
  app.use(errorHandler);
  return app;
}

export function startServer(): void {
  // The dev launcher injects PORT=5173 (Vite's port) into the environment. Vite proxies /api and
  // /socket.io to 3000, so the API must never bind the Vite port.
  const VITE_PORT = 5173;
  const envPort = Number(process.env.PORT ?? 3000);
  const PORT = Number.isInteger(envPort) && envPort > 0 && envPort !== VITE_PORT ? envPort : 3000;
  const { llm, provider, model } = createLlmFromEnv();
  if (provider === 'offline') console.warn('[warn] No GROQ_API_KEY or ANTHROPIC_API_KEY: guards run in offline mode.');
  else console.log(`[llm] provider=${provider} model=${model}`);
  const devCheats = process.env.DEV_CHEATS === '1';
  if (devCheats) console.warn('[warn] DEV_CHEATS on: typing /win clears a level.');

  const store = new GameStore({ llm, guards: GUARDS, devCheats });
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = createApp(store, { distDir: path.resolve(here, '../dist/client') });

  const http = createServer(app);
  // No CORS: the client is same-origin (served by this process in prod, proxied by Vite in dev).
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, { maxHttpBufferSize: 16 * 1024 });
  registerSockets(io, store);
  http.on('error', (err) => {
    console.error(`[server] cannot listen on port ${PORT}:`, err);
    process.exit(1);
  });
  http.listen(PORT, () => console.log(`Break the Guard on http://localhost:${PORT}`));

  // All game state lives in memory: log stray errors instead of crashing the process.
  process.on('unhandledRejection', (err) => console.error('[server] unhandled rejection:', err));
  process.on('uncaughtException', (err) => console.error('[server] uncaught exception:', err));
}

// Tests import createApp without starting a real server.
if (!process.env.VITEST) startServer();
