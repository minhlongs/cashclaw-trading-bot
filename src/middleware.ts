import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { resolveSessionUser } from '@/lib/auth/session-user';

const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];
const SENSITIVE_GET_PREFIXES = ['/api/bots', '/api/settings', '/api/alpha', '/api/ops'];
const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/me']);
const API_PREFIX = '/api/';
const AUTH_API_PREFIX = '/api/auth';

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function hasCrossOriginMutation(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (!PROTECTED_METHODS.includes(request.method) || !pathname.startsWith(API_PREFIX)) return false;
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return Boolean((origin && origin !== request.nextUrl.origin) || fetchSite === 'cross-site');
}

function requiresSession(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (PUBLIC_API_PATHS.has(pathname)) return false;
  return (PROTECTED_METHODS.includes(request.method) && pathname.startsWith(API_PREFIX))
    || (matchesPrefix(pathname, AUTH_API_PREFIX) && request.method === 'GET')
    || SENSITIVE_GET_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export async function middleware(req: NextRequest) {
  if (hasCrossOriginMutation(req)) return jsonError('Cross-origin request denied', 403);
  if (!requiresSession(req)) return NextResponse.next();

  const sessionId = req.cookies.get('session_id')?.value;
  if (!sessionId) return jsonError('Authentication required', 401);

  const db = createServerClient();
  if (!db) return jsonError('Session store unavailable', 503);
  const result = await resolveSessionUser(req, db);
  if (!result.userId) {
    return result.errorStatus === 503
      ? jsonError('Session validation unavailable', 503)
      : jsonError('Session expired or invalid', 401);
  }

  const sanitizedHeaders = new Headers(req.headers);
  sanitizedHeaders.delete('x-user-id');
  sanitizedHeaders.set('x-user-id', result.userId);
  return NextResponse.next({ request: { headers: sanitizedHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
