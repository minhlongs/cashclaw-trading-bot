import { describe, it, expect } from 'vitest';
import { middleware } from './middleware';

function makeReq(method: string, pathname: string, cookies: Record<string, string> = {}) {
  const cookieMap = new Map(
    Object.entries(cookies).map(([k, v]) => [k, { value: v, name: k }])
  );
  return {
    method,
    nextUrl: { pathname },
    cookies: { get: (name: string) => cookieMap.get(name) },
  } as any;
}

describe('middleware', () => {
  /* ── Mutating requests ─────────────────────────────────────── */

  it('allows POST with session cookie on protected route', () => {
    const res = middleware(makeReq('POST', '/api/bots', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks POST without session on protected route', () => {
    const res = middleware(makeReq('POST', '/api/bots'));
    expect(res.status).toBe(401);
  });

  it('allows PUT with session cookie', () => {
    const res = middleware(makeReq('PUT', '/api/settings', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks PUT without session', () => {
    const res = middleware(makeReq('PUT', '/api/settings'));
    expect(res.status).toBe(401);
  });

  it('allows DELETE with session cookie', () => {
    const res = middleware(makeReq('DELETE', '/api/bots/bot-1', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks DELETE without session on protected route', () => {
    const res = middleware(makeReq('DELETE', '/api/bots/bot-1'));
    expect(res.status).toBe(401);
  });

  it('allows PATCH with session cookie', () => {
    const res = middleware(makeReq('PATCH', '/api/bots/bot-1', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks PATCH without session', () => {
    const res = middleware(makeReq('PATCH', '/api/bots/bot-1'));
    expect(res.status).toBe(401);
  });

  /* ── Sensitive GET routes ──────────────────────────────────── */

  it('blocks GET /api/bots without session', () => {
    const res = middleware(makeReq('GET', '/api/bots'));
    expect(res.status).toBe(401);
  });

  it('allows GET /api/bots with session cookie', () => {
    const res = middleware(makeReq('GET', '/api/bots', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks GET /api/bots/[id] without session', () => {
    const res = middleware(makeReq('GET', '/api/bots/bot-1'));
    expect(res.status).toBe(401);
  });

  it('allows GET /api/bots/[id] with session cookie', () => {
    const res = middleware(makeReq('GET', '/api/bots/bot-1', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  it('blocks GET /api/settings without session', () => {
    const res = middleware(makeReq('GET', '/api/settings'));
    expect(res.status).toBe(401);
  });

  it('allows GET /api/settings with session cookie', () => {
    const res = middleware(makeReq('GET', '/api/settings', { session_id: 'ok' }));
    expect(res.status).toBe(200);
  });

  /* ── Public routes (no auth needed) ────────────────────────── */

  it('allows GET /api/health without session', () => {
    const res = middleware(makeReq('GET', '/api/health'));
    expect(res.status).toBe(200);
  });

  it('allows GET /api/version without session', () => {
    const res = middleware(makeReq('GET', '/api/version'));
    expect(res.status).toBe(200);
  });

  it('allows GET /api/metrics without session', () => {
    const res = middleware(makeReq('GET', '/api/metrics'));
    expect(res.status).toBe(200);
  });

  it('allows GET /api/killswitch-status without session', () => {
    const res = middleware(makeReq('GET', '/api/killswitch-status'));
    expect(res.status).toBe(200);
  });

  /* ── Auth routes (always public) ───────────────────────────── */

  it('allows POST /api/auth/login without session', () => {
    const res = middleware(makeReq('POST', '/api/auth/login'));
    expect(res.status).toBe(200);
  });

  it('allows POST /api/auth/logout without session', () => {
    const res = middleware(makeReq('POST', '/api/auth/logout'));
    expect(res.status).toBe(200);
  });

  it('allows GET /api/auth/me without session', () => {
    const res = middleware(makeReq('GET', '/api/auth/me'));
    expect(res.status).toBe(200);
  });

  /* ── Non-API routes ────────────────────────────────────────── */

  it('allows dashboard pages without session', () => {
    const res = middleware(makeReq('GET', '/vi/dashboard'));
    expect(res.status).toBe(200);
  });

  it('allows POST to non-API routes without session', () => {
    const res = middleware(makeReq('POST', '/vi/some-page'));
    expect(res.status).toBe(200);
  });
});
