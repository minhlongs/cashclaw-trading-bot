import { NextResponse, type NextRequest } from 'next/server';

// Session-cookie auth guard for Next.js App Router routes.
// This middleware applies to /api/* routes handled by Next.js only.
// Hono routes in src/worker.ts use Bearer token auth (auth-guard.ts).
// Protected: mutating endpoints (POST/PUT/DELETE/PATCH) + sensitive GET routes.
// Public: dashboard pages, health/version/metrics, auth endpoints.
const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

// API route prefixes that require auth for mutating requests.
const PROTECTED_API_PREFIXES = ['/api/bots', '/api/settings'];

// GET routes that contain sensitive data — bot capital, PnL, config, settings.
const SENSITIVE_GET_PREFIXES = ['/api/bots', '/api/settings'];

// Auth routes are always public (login, logout, me).
const PUBLIC_API_PREFIXES = ['/api/auth'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Auth routes are always public.
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Does this request need a session cookie?
  const isMutating = PROTECTED_METHODS.includes(method);
  const isSensitiveGet = !isMutating && SENSITIVE_GET_PREFIXES.some(p => pathname.startsWith(p));
  const needsAuth = (isMutating && PROTECTED_API_PREFIXES.some(p => pathname.startsWith(p))) || isSensitiveGet;

  if (!needsAuth) {
    return NextResponse.next();
  }

  // Validate session cookie exists.
  const sessionId = req.cookies.get('session_id')?.value;
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static assets, images, and Next.js internals.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
