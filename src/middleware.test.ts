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
  it('allows GET requests without auth', () => {
    const res = middleware(makeReq('GET', '/api/bots'));
    expect(res.status).toBe(200); // NextResponse.next() returns 200
  });

  it('allows HEAD requests without auth', () => {
    const res = middleware(makeReq('HEAD', '/api/bots'));
    expect(res.status).toBe(200);
  });

  it('allows public auth routes even for POST', () => {
    const res = middleware(makeReq('POST', '/api/auth/login'));
    expect(res.status).toBe(200);
  });

  it('allows non-protected POST routes', () => {
    const res = middleware(makeReq('POST', '/api/health'));
    expect(res.status).toBe(200);
  });

  it('allows protected routes with valid session cookie', () => {
    const res = middleware(makeReq('POST', '/api/bots/create', { session_id: 'abc123' }));
    expect(res.status).toBe(200);
  });

  it('returns 401 for protected routes without session cookie', () => {
    const res = middleware(makeReq('POST', '/api/bots/create'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for /api/settings POST without session', () => {
    const res = middleware(makeReq('PUT', '/api/settings/exchange'));
    expect(res.status).toBe(401);
  });

  it('allows /api/settings GET without session', () => {
    const res = middleware(makeReq('GET', '/api/settings'));
    expect(res.status).toBe(200);
  });

  it('allows DELETE with session cookie on protected route', () => {
    const res = middleware(makeReq('DELETE', '/api/bots/bot-1', { session_id: 'x' }));
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
});
