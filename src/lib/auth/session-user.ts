import type { D1Database } from '@/lib/db/types';
import { parseSessionCookie } from './session-utils';

export type SessionUserResult =
  | { userId: string; errorStatus: null }
  | { userId: null; errorStatus: 401 | 503 };

export async function resolveSessionUser(
  request: Request,
  db: D1Database,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SessionUserResult> {
  const sessionId = parseSessionCookie(request);
  if (!sessionId || sessionId.length > 128) return { userId: null, errorStatus: 401 };
  try {
    const row = await db.prepare(
      `SELECT s.user_id FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    ).bind(sessionId, nowSeconds).first<{ user_id: string }>();
    if (!row || typeof row.user_id !== 'string' || row.user_id.length === 0 || row.user_id.length > 128) {
      return { userId: null, errorStatus: 401 };
    }
    return { userId: row.user_id, errorStatus: null };
  } catch {
    return { userId: null, errorStatus: 503 };
  }
}
