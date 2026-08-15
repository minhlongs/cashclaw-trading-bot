import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAll = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

import { middleware } from './middleware';
import { createServerClient } from '@/lib/db/client';

function makeReq(method: string, pathname: string, cookies: Record<string, string> = {}) {
  const cookieMap = new Map(
    Object.entries(cookies).map(([k, v]) => [k, { value: v, name: k }])
  );
  return {
    method,
    nextUrl: { pathname },
    cookies: { get: (name: string) => cookieMap.get(name) },
    headers: {},
  } as any;
}

function mockDbSession(userId: string, expiresAt: number) {
  vi.mocked(createServerClient).mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ all: mockAll.mockResolvedValue({ results: [{ user_id: userId, expires_at: expiresAt }] }) }),
    }),
  } as any);
}

function mockDbEmpty() {
  vi.mocked(createServerClient).mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ all: mockAll.mockResolvedValue({ results: [] }) }),
    }),
  } as any);
}

function mockDbError() {
  vi.mocked(createServerClient).mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ all: mockAll.mockRejectedValue(new Error('D1 down')) }),
    }),
  } as any);
}

function mockDbUnavailable() {
  vi.mocked(createServerClient).mockReturnValue(null as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('middleware', () => {
  /* ── Mutating requests ─────────────────────────────────────── */

  it('allows POST with valid session on protected route', async () => {
    mockDbSession('u1', Date.now() + 86400000);
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

  it('blocks POST when D1 query fails', async () => {
    mockDbError();
    const res = await middleware(makeReq('POST', '/api/bots', { session_id: 'db-fail' }));
    expect(res.status).toBe(401);
  });

  it('allows PUT with valid session', async () => {
    mockDbSession('u1', Date.now() + 86400000);
    const res = await middleware(makeReq('PUT', '/api/settings', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks PUT without session', async () => {
    const res = await middleware(makeReq('PUT', '/api/settings'));
    expect(res.status).toBe(401);
  });

  it('allows DELETE with valid session', async () => {
    mockDbSession('u1', Date.now() + 86400000);
    const res = await middleware(makeReq('DELETE', '/api/bots/bot-1', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks DELETE without session on protected route', async () => {
    const res = await middleware(makeReq('DELETE', '/api/bots/bot-1'));
    expect(res.status).toBe(401);
  });

  it('allows PATCH with valid session', async () => {
    mockDbSession('u1', Date.now() + 86400000);
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
    mockDbSession('u1', Date.now() + 86400000);
    const res = await middleware(makeReq('GET', '/api/bots', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks GET /api/bots/[id] without session', async () => {
    const res = await middleware(makeReq('GET', '/api/bots/bot-1'));
    expect(res.status).toBe(401);
  });

  it('allows GET /api/bots/[id] with valid session', async () => {
    mockDbSession('u1', Date.now() + 86400000);
    const res = await middleware(makeReq('GET', '/api/bots/bot-1', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks GET /api/settings without session', async () => {
    const res = await middleware(makeReq('GET', '/api/settings'));
    expect(res.status).toBe(401);
  });

  it('allows GET /api/settings with valid session', async () => {
    mockDbSession('u1', Date.now() + 86400000);
    const res = await middleware(makeReq('GET', '/api/settings', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  /* ── Public routes (no auth needed) ────────────────────────── */

  it('allows GET /api/health without session', async () => {
    const res = await middleware(makeReq('GET', '/api/health'));
    expect(res.status).toBe(200);
  });

  it('allows GET /api/version without session', async () => {
    const res = await middleware(makeReq('GET', '/api/version'));
    expect(res.status).toBe(200);
  });

  it('allows GET /api/metrics without session', async () => {
    const res = await middleware(makeReq('GET', '/api/metrics'));
    expect(res.status).toBe(200);
  });

  it('allows GET /api/killswitch-status without session', async () => {
    const res = await middleware(makeReq('GET', '/api/killswitch-status'));
    expect(res.status).toBe(200);
  });

  /* ── Auth routes (always public) ───────────────────────────── */

  it('allows POST /api/auth/login without session', async () => {
    const res = await middleware(makeReq('POST', '/api/auth/login'));
    expect(res.status).toBe(200);
  });

  it('allows POST /api/auth/logout without session', async () => {
    const res = await middleware(makeReq('POST', '/api/auth/logout'));
    expect(res.status).toBe(200);
  });

  it('allows GET /api/auth/me without session', async () => {
    const res = await middleware(makeReq('GET', '/api/auth/me'));
    expect(res.status).toBe(200);
  });

  /* ── Non-API routes ────────────────────────────────────────── */

  it('allows dashboard pages without session', async () => {
    const res = await middleware(makeReq('GET', '/vi/dashboard'));
    expect(res.status).toBe(200);
  });

  it('allows POST to non-API routes without session', async () => {
    const res = await middleware(makeReq('POST', '/vi/some-page'));
    expect(res.status).toBe(200);
  });

  /* ── DB unavailable fallback ────────────────────────────────── */

  it('falls back to cookie check when DB unavailable (dev mode)', async () => {
    mockDbUnavailable();
    const res = await middleware(makeReq('POST', '/api/bots', { session_id: 'dev-ok' }));
    expect(res.status).toBe(200);
  });

  it('returns 503 when DB unavailable in production', async () => {
    mockDbUnavailable();
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await middleware(makeReq('POST', '/api/bots', { session_id: 'prod-ok' }));
      expect(res.status).toBe(503);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('strips client-supplied x-user-id header', async () => {
    mockDbSession('server-user', Date.now() + 86400000);
    const req = makeReq('POST', '/api/bots', { session_id: 'valid-session' });
    req.headers = { 'x-user-id': 'spoofed-user' };
    const res = await middleware(req);
    expect(res.status).toBe(200);
    // Response headers should NOT contain client-supplied x-user-id
    expect(res.headers.get('x-user-id')).toBeNull();
  });
});
