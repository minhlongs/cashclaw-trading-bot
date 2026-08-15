import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/db/client';

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

export async function middleware(req: NextRequest) {
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

  // Strip any client-supplied x-user-id to prevent spoofing
  const sanitizedHeaders = new Headers(req.headers);
  sanitizedHeaders.delete('x-user-id');

  // Validate session against D1
  const db = createServerClient();
  if (db) {
    try {
      const now = Date.now();
      const { results } = await db
        .prepare('SELECT user_id, expires_at FROM user_sessions WHERE session_id = ?')
        .bind(sessionId)
        .all<{ user_id: string; expires_at: number }>();

      if (!results.length || results[0].expires_at < now) {
        return NextResponse.json(
          { ok: false, error: 'Session expired' },
          { status: 401 }
        );
      }

      // Set server-verified userId on request (overrides any client value)
      sanitizedHeaders.set('x-user-id', results[0].user_id);
      return NextResponse.next({ request: { headers: sanitizedHeaders } });
    } catch {
      // D1 query failed — deny request rather than silently allowing
      return NextResponse.json(
        { ok: false, error: 'Session validation failed' },
        { status: 401 }
      );
    }
  }

  // No DB available (local dev only) — accept with valid cookie
  // In production this should never happen; fail-closed.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { ok: false, error: 'Session store unavailable' },
      { status: 503 }
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
