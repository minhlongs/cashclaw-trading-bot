import { createServerClient } from '@/lib/db/client';
import type { D1Database } from '@/lib/db/types';

export type ServerSessionResolution =
  | { readonly status: 'valid'; readonly userId: string }
  | { readonly status: 'invalid' }
  | { readonly status: 'unavailable' };

/**
 * Resolve authenticated user identity strictly from a server-verified `session_id` token.
 * Never reads or trusts request headers (`x-user-id`, forwarded headers, or query params).
 */
export async function resolveServerSessionUser(
  sessionId: string,
  db?: D1Database | null,
): Promise<ServerSessionResolution> {
  const trimmedSessionId = sessionId.trim();
  if (!trimmedSessionId) {
    return { status: 'invalid' };
  }

  const client = db !== undefined ? db : createServerClient();
  if (client) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const { results } = await client
        .prepare('SELECT user_id, expires_at FROM user_sessions WHERE id = ?')
        .bind(trimmedSessionId)
        .all<{ user_id: string; expires_at: number }>();

      const row = results[0];
      const userId = row?.user_id?.trim();
      if (!row || !userId || row.expires_at < now) {
        return { status: 'invalid' };
      }
      return { status: 'valid', userId };
    } catch {
      return { status: 'invalid' };
    }
  }

  const isLocalDevOrTest =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (!isLocalDevOrTest) {
    return { status: 'unavailable' };
  }
  const safeDevSession = trimmedSessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'local';
  return { status: 'valid', userId: `dev_${safeDevSession}` };
}
