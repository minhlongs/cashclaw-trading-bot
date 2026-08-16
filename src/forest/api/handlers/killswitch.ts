import { getBotManager } from '@/tree/bot';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/killswitch');

export async function killswitchHaltHandler(reason: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!reason || reason.trim().length === 0) {
      return { ok: false, error: 'Reason is required' };
    }
    getBotManager().manualHalt(reason);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    log.error('Killswitch halt failed', error, { action: 'killswitchHalt' });
    return { ok: false, error: 'Killswitch halt failed' } as { ok: boolean; error: string };
  }
}

export async function killswitchResumeHandler(): Promise<{ ok: boolean; error?: string }> {
  try {
    getBotManager().manualResume();
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    log.error('Killswitch resume failed', error, { action: 'killswitchResume' });
    return { ok: false, error: 'Killswitch resume failed' } as { ok: boolean; error: string };
  }
}