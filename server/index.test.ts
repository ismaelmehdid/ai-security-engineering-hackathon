import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clientKey, createApp, createRateLimiter } from './index';
import { GameStore } from './game';
import type { GuardConfig } from './guardTypes';

const guard = (level: number): GuardConfig => ({
  level, systemPrompt: () => 'S', tools: () => [], runTool: () => ({ result: 'ok', win: false }),
});
const guards = { 1: guard(1), 2: guard(2), 3: guard(3), 4: guard(4), 5: guard(5) };

let http: HttpServer | undefined;
afterEach(() => { http?.close(); http = undefined; });

async function serve(opts: { maxGames?: number; now?: () => number; distDir?: string; apiLimit?: number } = {}) {
  const store = new GameStore({ llm: { create: vi.fn() }, guards, maxGames: opts.maxGames });
  const app = createApp(store, { distDir: opts.distDir ?? null, now: opts.now, apiLimitPerMinute: opts.apiLimit });
  await new Promise<void>((r) => { http = app.listen(0, () => r()); });
  return { store, base: `http://localhost:${(http!.address() as AddressInfo).port}` };
}
const post = (base: string, ip?: string) =>
  fetch(`${base}/api/games`, { method: 'POST', headers: ip ? { 'cf-connecting-ip': ip } : {} });

describe('http app', () => {
  it('sends security headers and hides x-powered-by', async () => {
    const { base } = await serve();
    const res = await post(base);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://cdn.jsdelivr.net');
  });

  it('rate limits game creation per IP: 10 per minute, then 429 until the window resets', async () => {
    let t = 0;
    const { base } = await serve({ now: () => t });
    for (let i = 0; i < 10; i++) expect((await post(base)).status).toBe(200);
    const limited = await post(base);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await limited.json()).error).toBeTruthy();
    t += 61_000;
    expect((await post(base)).status).toBe(200);
  });

  it('keys limits by cf-connecting-ip from the local tunnel, so players do not share a bucket', async () => {
    const { base } = await serve({ now: () => 0 });
    for (let i = 0; i < 10; i++) expect((await post(base, '203.0.113.1')).status).toBe(200);
    expect((await post(base, '203.0.113.1')).status).toBe(429);
    expect((await post(base, '203.0.113.2')).status).toBe(200);
  });

  it('applies the general limiter to /api only, never to static assets or SPA routes', async () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'btg-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>t</title>');
    fs.writeFileSync(path.join(dist, 'app.js'), 'console.log(1)');
    try {
      const { base } = await serve({ now: () => 0, distDir: dist, apiLimit: 2 });
      expect((await fetch(`${base}/api/games/ABCDE`)).status).toBe(200);
      expect((await fetch(`${base}/api/games/ABCDE`)).status).toBe(200);
      expect((await fetch(`${base}/api/games/ABCDE`)).status).toBe(429);
      for (let i = 0; i < 5; i++) {
        expect((await fetch(`${base}/app.js`)).status).toBe(200);
        expect((await fetch(`${base}/play/ABCDE`)).status).toBe(200);
      }
    } finally {
      fs.rmSync(dist, { recursive: true, force: true });
    }
  });

  it('returns 503 when the server holds the maximum number of games', async () => {
    const { base } = await serve({ maxGames: 1 });
    expect((await post(base)).status).toBe(200);
    expect((await post(base)).status).toBe(503);
  });

  it('validates the game id route param', async () => {
    const { base } = await serve();
    const { gameId } = (await (await post(base)).json()) as { gameId: string };
    expect(await (await fetch(`${base}/api/games/${gameId.toLowerCase()}`)).json()).toEqual({ exists: true });
    expect(await (await fetch(`${base}/api/games/ZZZZZ`)).json()).toEqual({ exists: false });
    expect((await fetch(`${base}/api/games/${'A'.repeat(11)}`)).status).toBe(400);
    expect((await fetch(`${base}/api/games/ab%2F..%2Fc`)).status).toBe(400);
  });

  it('rejects JSON bodies over 10kb with a generic error (no stack trace)', async () => {
    const { base } = await serve();
    const res = await fetch(`${base}/api/games`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'y'.repeat(20_000) }),
    });
    expect(res.status).toBe(413);
    const body = await res.text();
    expect(body).not.toContain('at ');
  });
});

const fakeReq = (remoteAddress: string | undefined, headers: Record<string, unknown> = {}) =>
  ({ socket: { remoteAddress }, headers }) as never;

describe('clientKey', () => {
  it('uses cf-connecting-ip only when the peer is loopback (the local tunnel)', () => {
    expect(clientKey(fakeReq('127.0.0.1', { 'cf-connecting-ip': '203.0.113.5' }))).toBe('203.0.113.5');
    expect(clientKey(fakeReq('::1', { 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientKey(fakeReq('::ffff:127.0.0.1', { 'cf-connecting-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });
  it('ignores the header from non-loopback peers (no spoofing)', () => {
    expect(clientKey(fakeReq('198.51.100.9', { 'cf-connecting-ip': '1.2.3.4' }))).toBe('198.51.100.9');
  });
  it('falls back to the socket address when the header is missing or not an IP', () => {
    expect(clientKey(fakeReq('127.0.0.1'))).toBe('127.0.0.1');
    expect(clientKey(fakeReq('127.0.0.1', { 'cf-connecting-ip': 'not-an-ip' }))).toBe('127.0.0.1');
    expect(clientKey(fakeReq('127.0.0.1', { 'cf-connecting-ip': ['1.1.1.1', '2.2.2.2'] }))).toBe('127.0.0.1');
    expect(clientKey(fakeReq(undefined))).toBe('unknown');
  });
});

describe('createRateLimiter', () => {
  it('keeps separate buckets per client key', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    const run = (ip: string) => {
      let status = 200;
      const res = { status: (s: number) => { status = s; return res; }, json: () => res, setHeader: () => res };
      let passed = false;
      limiter(fakeReq(ip), res as never, () => { passed = true; });
      return passed ? 200 : status;
    };
    expect(run('1.1.1.1')).toBe(200);
    expect(run('1.1.1.1')).toBe(429);
    expect(run('2.2.2.2')).toBe(200);
  });
});
