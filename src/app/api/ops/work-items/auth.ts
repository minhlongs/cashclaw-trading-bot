import { NextResponse } from 'next/server';
import { createServerClient, type D1Database } from '@/lib/db/client';
import { resolveSessionUser } from '@/lib/auth/session-user';

export type OperationsAuth =
  | { db: D1Database; userId: string; response?: never }
  | { db?: never; userId?: never; response: NextResponse };

export async function requireOperationsUser(request: Request): Promise<OperationsAuth> {
  const db = createServerClient();
  if (!db) {
    return { response: NextResponse.json({ ok: false, error: 'Persistent database unavailable' }, { status: 503 }) };
  }
  const session = await resolveSessionUser(request, db);
  if (!session.userId) {
    const status = session.errorStatus ?? 401;
    const message = status === 503 ? 'Session validation unavailable' : 'Authentication required';
    return { response: NextResponse.json({ ok: false, error: message }, { status }) };
  }
  return { db, userId: session.userId };
}
