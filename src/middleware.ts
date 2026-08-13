import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Session-cookie auth guard for Next.js App Router routes.
// This middleware applies to /api/* routes handled by Next.js only.
// Hono routes in src/worker.ts use Bearer token auth (auth-guard.ts).
// Protected API methods — only mutating endpoints require session cookie.
// Public: GET pages, GET API (settings/bots list), auth endpoints.
const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

// API route prefixes that require auth for mutating requests.
const PROTECTED_API_PREFIXES = ['/api/bots', '/api/settings'];

// Auth routes are always public (login, logout, me).
const PUBLIC_API_PREFIXES = ['/api/auth'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Allow non-mutating requests (GET, HEAD) without auth — dashboard pages, data reads.
  if (!PROTECTED_METHODS.includes(method)) {
    return NextResponse.next();
  }

  // Auth routes are always public.
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check if this is a protected API route.
  const isProtectedApi = PROTECTED_API_PREFIXES.some(p => pathname.startsWith(p));
  if (!isProtectedApi) {
    return NextResponse.next();
  }

  // Validate session cookie exists for mutating API requests.
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
