// GET /api/auth/me — get current user from session cookie.
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { parseSessionCookie } from '@/lib/auth/session-utils';
import { createLogger } from '@/lib/logger';

const log = createLogger({ module: 'auth-me' });

export async function GET(req: Request) {
  try {
    const sessionId = parseSessionCookie(req);
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const db = createServerClient();
    if (!db) {
      return NextResponse.json({ ok: false, error: 'Service temporarily unavailable' }, { status: 503 });
    }

    const session = await db.prepare(
      `SELECT s.id as session_id, s.user_id, s.expires_at, u.email, u.display_name, u.locale
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`
    ).bind(sessionId, Math.floor(Date.now() / 1000)).first<{
      session_id: string; user_id: string; expires_at: number;
      email: string; display_name: string; locale: string;
    }>();

    if (!session) {
      return NextResponse.json({ ok: false, error: 'Session expired' }, { status: 401 });
    }

    // Rolling expiry: extend session by 7 days on successful use.
    const newExpiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
    await db.prepare('UPDATE user_sessions SET expires_at = ? WHERE id = ?')
      .bind(newExpiresAt, session.session_id).run();

    return NextResponse.json({
      ok: true,
      user: {
        id: session.user_id,
        email: session.email,
        displayName: session.display_name,
        locale: session.locale,
      },
    });
  } catch (error) {
    log.error('Auth check failed', error instanceof Error ? error : new Error(String(error)), { action: 'GET /api/auth/me' });
    return NextResponse.json({ ok: false, error: 'Auth check failed' }, { status: 500 });
  }
}
