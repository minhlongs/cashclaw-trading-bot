// POST /api/auth/logout — clear session cookie and delete session from D1.
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { parseSessionCookie } from '@/lib/auth/session-utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger('auth-logout');

export async function POST(req: Request) {
  try {
    const sessionId = parseSessionCookie(req);
    const db = createServerClient();

    if (sessionId && db) {
      await db.prepare('DELETE FROM user_sessions WHERE id = ?').bind(sessionId).run();
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.delete('session_id');
    return response;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error('Logout failed', err, { action: 'clear-session' });
    return NextResponse.json({ ok: false, error: 'Logout failed' }, { status: 500 });
  }
}
