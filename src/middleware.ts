import { NextResponse, type NextRequest } from 'next/server';
import { resolveServerSessionUser } from '@/lib/auth/session-resolver';

const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];
const PROTECTED_API_PREFIXES = ['/api/bots', '/api/settings', '/api/alpha', '/api/ops', '/api/ee'];
const SENSITIVE_GET_PREFIXES = [
  '/api/bots',
  '/api/settings',
  '/api/alpha',
  '/api/ops',
  '/api/ee',
  '/api/metrics',
  '/api/killswitch-status',
];

const PUBLIC_API_PREFIXES = ['/api/auth'];
const PUBLIC_WEBHOOK_PATHS = ['/api/ee/billing/ipn', '/api/ee/billing/nowpayments-ipn'];

function matchesWebhookPath(pathname: string): boolean {
  return PUBLIC_WEBHOOK_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Unconditionally strip client-supplied x-user-id across every route (API, SSR pages, Server Actions).
  const sanitizedHeaders = new Headers(req.headers ?? {});
  sanitizedHeaders.delete('x-user-id');

  if (
    PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)) ||
    (method === 'POST' && matchesWebhookPath(pathname))
  ) {
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
  }

  const isMutating = PROTECTED_METHODS.includes(method);
  const isSensitiveGet = !isMutating && SENSITIVE_GET_PREFIXES.some((p) => pathname.startsWith(p));
  const needsAuth =
    (isMutating && PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p))) || isSensitiveGet;

  const sessionId = req.cookies.get('session_id')?.value;
  if (!needsAuth) {
    if (sessionId) {
      const resolved = await resolveServerSessionUser(sessionId);
      if (resolved.status === 'valid') {
        sanitizedHeaders.set('x-user-id', resolved.userId);
      }
    }
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
  }

  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const resolved = await resolveServerSessionUser(sessionId);
  if (resolved.status === 'unavailable') {
    return NextResponse.json({ ok: false, error: 'Session store unavailable' }, { status: 503 });
  }
  if (resolved.status === 'invalid') {
    return NextResponse.json({ ok: false, error: 'Session expired' }, { status: 401 });
  }

  sanitizedHeaders.set('x-user-id', resolved.userId);
  return NextResponse.next({ request: { headers: sanitizedHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$).*)'],
};
