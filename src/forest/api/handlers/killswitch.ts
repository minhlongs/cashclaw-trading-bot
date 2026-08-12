/**
 * Killswitch API handlers
 * - POST /api/killswitch/halt  — halt all trading
 * - POST /api/killswitch/resume — resume trading
 */

import { getBotManager } from '@/tree/bot';

export async function killswitchHaltHandler(
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!reason.trim()) {
      return { ok: false, error: 'Reason is required' };
    }
    getBotManager().manualHalt(reason);
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
    return { ok: true };
  } catch {
    return { ok: false, error: 'Killswitch resume failed' } as { ok: boolean; error: string };
  }
}
