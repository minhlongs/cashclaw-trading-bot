import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn() }));

import { middleware } from './middleware';
import { createServerClient } from '@/lib/db/client';

function makeReq(method: string, pathname: string, cookies: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const cookieMap = new Map(Object.entries(cookies).map(([k, v]) => [k, { value: v, name: k }]));
  const requestHeaders = new Headers(headers);
  if (Object.keys(cookies).length) requestHeaders.set('cookie', Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '));
  return { method, nextUrl: { pathname, origin: 'https://example.test' }, cookies: { get: (name: string) => cookieMap.get(name) }, headers: requestHeaders } as unknown as Parameters<typeof middleware>[0];
}

function mockDbSession(userId: string, expiresAt: number) {
  const bind = vi.fn((_sessionId: string, now: number) => ({
    first: vi.fn().mockResolvedValue(expiresAt > now ? { user_id: userId } : null),
  }));
  vi.mocked(createServerClient).mockReturnValue({
    prepare: vi.fn().mockReturnValue({ bind }),
  } as never);
}

function mockDbEmpty() {
  vi.mocked(createServerClient).mockReturnValue({
    prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) }),
  } as never);
}

function mockDbError() {
  vi.mocked(createServerClient).mockReturnValue({
    prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockRejectedValue(new Error('D1 down')) }) }),
  } as never);
}

function mockDbUnavailable() {
  vi.mocked(createServerClient).mockReturnValue(null as never);
}

beforeEach(() => vi.clearAllMocks());

describe('middleware', () => {
  /* ── Mutating requests ─────────────────────────────────────── */

  it('allows POST with valid session on protected route', async () => {
    mockDbSession('u1', Math.floor(Date.now() / 1000) + 86400);
    const res = await middleware(makeReq('POST', '/api/bots', { session_id: 'valid-session' }));
    expect(res.status).toBe(200);
  });

  it('blocks POST without session on protected route', async () => {
    const res = await middleware(makeReq('POST', '/api/bots'));
    expect(res.status).toBe(401);
  });

  it('blocks POST with expired session', async () => {
    mockDbSession('u1', 1000);
    const res = await middleware(makeReq('POST', '/api/bots', { session_id: 'expired' }));
    expect(res.status).toBe(401);
  });

  it('blocks POST with session not in D1', async () => {
    mockDbEmpty();
    const res = await middleware(makeReq('POST', '/api/bots', { session_id: 'unknown' }));
    expect(res.status).toBe(401);
  });

  it('fails closed with 503 when D1 session lookup fails', async () => {
    mockDbError();
    const res = await middleware(makeReq('POST', '/api/bots', { session_id: 'db-fail' }));
    expect(res.status).toBe(503);
  });

  it('allows PUT with valid session', async () => {
    mockDbSession('u1', Math.floor(Date.now() / 1000) + 86400);
    const res = await middleware(makeReq('PUT', '/api/settings', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks PUT without session', async () => {
    const res = await middleware(makeReq('PUT', '/api/settings'));
    expect(res.status).toBe(401);
  });

  it('allows DELETE with valid session', async () => {
    mockDbSession('u1', Math.floor(Date.now() / 1000) + 86400);
    const res = await middleware(makeReq('DELETE', '/api/bots/bot-1', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks DELETE without session on protected route', async () => {
    const res = await middleware(makeReq('DELETE', '/api/bots/bot-1'));
    expect(res.status).toBe(401);
  });

  it('allows PATCH with valid session', async () => {
    mockDbSession('u1', Math.floor(Date.now() / 1000) + 86400);
    const res = await middleware(makeReq('PATCH', '/api/bots/bot-1', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks PATCH without session', async () => {
    const res = await middleware(makeReq('PATCH', '/api/bots/bot-1'));
    expect(res.status).toBe(401);
  });

  /* ── Sensitive GET routes ──────────────────────────────────── */

  it('blocks GET /api/bots without session', async () => {
    const res = await middleware(makeReq('GET', '/api/bots'));
    expect(res.status).toBe(401);
  });

  it('allows GET /api/bots with valid session', async () => {
    mockDbSession('u1', Math.floor(Date.now() / 1000) + 86400);
    const res = await middleware(makeReq('GET', '/api/bots', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks GET /api/bots/[id] without session', async () => {
    const res = await middleware(makeReq('GET', '/api/bots/bot-1'));
    expect(res.status).toBe(401);
  });

  it('allows GET /api/bots/[id] with valid session', async () => {
    mockDbSession('u1', Math.floor(Date.now() / 1000) + 86400);
    const res = await middleware(makeReq('GET', '/api/bots/bot-1', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks GET /api/settings without session', async () => {
    const res = await middleware(makeReq('GET', '/api/settings'));
    expect(res.status).toBe(401);
  });

  it('allows GET /api/settings with valid session', async () => {
    mockDbSession('u1', Math.floor(Date.now() / 1000) + 86400);
    const res = await middleware(makeReq('GET', '/api/settings', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks operations reads without a session', async () => {
    const res = await middleware(makeReq('GET', '/api/ops/work-items'));
    expect(res.status).toBe(401);
  });

  it('allows operations reads and writes only with a valid session', async () => {
    mockDbSession('u1', Math.floor(Date.now() / 1000) + 86400);
    expect((await middleware(makeReq('GET', '/api/ops/work-items', { session_id: 'ok' }))).status).toBe(200);
    mockDbSession('u1', Math.floor(Date.now() / 1000) + 86400);
    expect((await middleware(makeReq('POST', '/api/ops/work-items', { session_id: 'ok' }))).status).toBe(200);
  });

  /* ── Public routes (no auth needed) ────────────────────────── */
  it('allows GET /api/health without session', async () => {
    expect((await middleware(makeReq('GET', '/api/health'))).status).toBe(200);
  });
  it('allows GET /api/version without session', async () => {
    expect((await middleware(makeReq('GET', '/api/version'))).status).toBe(200);
  });
  it('allows GET /api/metrics without session', async () => {
    expect((await middleware(makeReq('GET', '/api/metrics'))).status).toBe(200);
  });
  it('allows GET /api/killswitch-status without session', async () => {
    expect((await middleware(makeReq('GET', '/api/killswitch-status'))).status).toBe(200);
  });

  /* ── Auth routes (always public) ───────────────────────────── */
  it('allows POST /api/auth/login without session', async () => {
    expect((await middleware(makeReq('POST', '/api/auth/login'))).status).toBe(200);
  });
  it('allows POST /api/auth/logout without session', async () => {
    expect((await middleware(makeReq('POST', '/api/auth/logout'))).status).toBe(200);
  });
  it('allows GET /api/auth/me without session', async () => {
    expect((await middleware(makeReq('GET', '/api/auth/me'))).status).toBe(200);
  });

  /* ── Non-API routes ────────────────────────────────────────── */
  it('allows dashboard pages without session', async () => {
    expect((await middleware(makeReq('GET', '/vi/dashboard'))).status).toBe(200);
  });
  it('allows POST to non-API routes without session', async () => {
    expect((await middleware(makeReq('POST', '/vi/some-page'))).status).toBe(200);
  });

  /* ── DB unavailable fallback ────────────────────────────────── */

  it('fails closed when DB unavailable in development too', async () => {
    mockDbUnavailable();
    const res = await middleware(makeReq('POST', '/api/bots', { session_id: 'dev-ok' }));
    expect(res.status).toBe(503);
  });

  it('returns 503 when DB unavailable in production', async () => {
    mockDbUnavailable();
    vi.stubEnv('NODE_ENV', 'production');
    const res = await middleware(makeReq('POST', '/api/bots', { session_id: 'prod-ok' }));
    expect(res.status).toBe(503);
    vi.unstubAllEnvs();
  });

  it('strips client-supplied x-user-id header', async () => {
    mockDbSession('server-user', Math.floor(Date.now() / 1000) + 86400);
    const req = makeReq('POST', '/api/bots', { session_id: 'valid-session' }, { 'x-user-id': 'spoofed-user' });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-user-id')).toBeNull();
  });

  it('treats the exact expiry second as expired', async () => {
    mockDbSession('u1', Math.floor(Date.now() / 1000));
    expect((await middleware(makeReq('GET', '/api/ops/work-items', { session_id: 'expired-now' }))).status).toBe(401);
  });

  it('does not accidentally match adjacent route names', async () => {
    expect((await middleware(makeReq('GET', '/api/opsx'))).status).toBe(200);
    expect((await middleware(makeReq('GET', '/api/bots-extra'))).status).toBe(200);
  });

  it('protects new mutating API routes by default', async () => {
    expect((await middleware(makeReq('POST', '/api/new-sensitive-route'))).status).toBe(401);
  });

  it('rejects cross-origin and cross-site API mutations', async () => {
    const foreignOrigin = makeReq('POST', '/api/ops/work-items', { session_id: 's1' }, { origin: 'https://attacker.example' });
    expect((await middleware(foreignOrigin)).status).toBe(403);
    const crossSite = makeReq('PATCH', '/api/ops/work-items/x', { session_id: 's1' }, { 'sec-fetch-site': 'cross-site' });
    expect((await middleware(crossSite)).status).toBe(403);
  });
});
