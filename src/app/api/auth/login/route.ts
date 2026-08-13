// POST /api/auth/login — email + passcode authentication.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/client';
import { generateSessionId } from '@/lib/auth/session-utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger('auth-login');

const LoginSchema = z.object({
  email: z.string().email(),
  passcode: z.string().min(1).max(128),
});

// Simple in-memory rate limiter: max 5 attempts per minute per email.
// Resets on Worker cold start (acceptable for single-user trading bot).
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const record = attempts.get(email);
  if (!record || now > record.resetAt) {
    attempts.set(email, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_ATTEMPTS) return false;
  record.count++;
  return true;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 });
    }
    const { email, passcode } = parsed.data;

    if (!checkRateLimit(email)) {
      return NextResponse.json({ ok: false, error: 'Too many attempts — try again later' }, { status: 429 });
    }

    const db = createServerClient();
    if (!db) {
      return NextResponse.json({ ok: false, error: 'Service temporarily unavailable' }, { status: 503 });
    }

    const user = await db.prepare(
      'SELECT id, email, passcode_hash FROM users WHERE email = ?'
    ).bind(email).first<{ id: string; email: string; passcode_hash: string }>();

    if (!user || !user.passcode_hash) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // Verify passcode against stored hash (SHA-256 + salt).
    const { verifyPasscode } = await import('@/lib/auth/session-utils');
    const valid = await verifyPasscode(email, passcode, user.passcode_hash);
    if (!valid) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // Clean up expired sessions for this user.
    await db.prepare('DELETE FROM user_sessions WHERE user_id = ? AND expires_at < ?')
      .bind(user.id, Math.floor(Date.now() / 1000)).run();

    const sessionId = generateSessionId();
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;

    await db.prepare(
      'INSERT INTO user_sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionId, user.id, expiresAt).run();

    const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return response;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error('Login failed', err, { action: 'authenticate' });
    return NextResponse.json({ ok: false, error: 'Login failed' }, { status: 500 });
  }
}
