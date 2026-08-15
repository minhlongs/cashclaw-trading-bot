/**
 * Killswitch API handlers
 * - POST /api/killswitch/halt  — halt all trading
 * - POST /api/killswitch/resume — resume trading
 */

import { getBotManager } from '@/tree/bot';
import { createLogger } from '@/lib/logger';
import { createServerClient } from '@/lib/db/client';

const log = createLogger('api/killswitch');

async function recordAudit(action: 'halt' | 'resume', reason: string): Promise<void> {
  try {
    const db = createServerClient();
    if (!db) return;
    const now = Date.now();
    const id = `ks_${now.toString(36)}_${(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : '0')}`;
    await db.prepare(
      'INSERT INTO killswitch_events (id, action, user_id, reason, bot_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, action, null, reason.slice(0, 200), 'all', '{}', now).run();
  } catch (error) {
    log.warn('killswitch audit write failed', { action, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function killswitchHaltHandler(
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!reason.trim()) {
      return { ok: false, error: 'Reason is required' };
    }
    getBotManager().manualHalt(reason);
    await recordAudit('halt', reason);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Killswitch halt failed' };
  }
}

export async function killswitchResumeHandler(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    getBotManager().manualResume();
    await recordAudit('resume', '');
    return { ok: true };
  } catch (error) {
    log.error('Killswitch resume failed', error instanceof Error ? error : new Error(String(error)), { action: 'killswitchResume' });
    return { ok: false, error: 'Killswitch resume failed' } as { ok: boolean; error: string };
  }
}