import { getBotManager } from '@/tree/bot';
import { emergencyHalt, resumeFromHalt } from '@/forest/settings/actions';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/killswitch');

export async function killswitchHaltHandler(reason: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!reason || reason.trim().length === 0) {
      return { ok: false, error: 'Reason is required' };
    }
    getBotManager().manualHalt(reason);
    const d1Res = await emergencyHalt(reason, userId);
    if (!d1Res.ok && d1Res.error !== 'Database not available') {
      log.warn('Killswitch halt D1 sync failed', { action: 'killswitchHalt', error: d1Res.error });
    }
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    log.error('Killswitch halt failed', error, { action: 'killswitchHalt' });
    return { ok: false, error: 'Killswitch halt failed' } as { ok: boolean; error: string };
  }
}

export async function killswitchResumeHandler(userId?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    getBotManager().manualResume();
    const d1Res = await resumeFromHalt(userId);
    if (!d1Res.ok && d1Res.error !== 'Database not available') {
      log.warn('Killswitch resume D1 sync failed', { action: 'killswitchResume', error: d1Res.error });
    }
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    log.error('Killswitch resume failed', error, { action: 'killswitchResume' });
    return { ok: false, error: 'Killswitch resume failed' } as { ok: boolean; error: string };
  }
}