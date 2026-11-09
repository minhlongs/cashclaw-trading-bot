// Forest layer — Bot lifecycle actions (start, stop, pause, resume, killswitch)
// Delegates lifecycle control to unified botControlHandler (enforcing credential preflight on start).

'use server';

import { getBotManager } from '@/tree/bot';
import { botControlHandler } from '@/forest/api/handlers/bot-control';
import { emergencyHalt, resumeFromHalt } from '@/forest/settings/actions';

function normalizeActionError(
  result: { ok: boolean; error?: string },
  id: string,
): { ok: boolean; error?: string } {
  if (!result.ok && result.error === `Bot not found: ${id}`) {
    return { ok: false, error: 'Bot not found' };
  }
  return result;
}

// ── Server Actions ──────────────────────────────────────────────
export async function botActionStart(id: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  return normalizeActionError(await botControlHandler(id, 'start', userId), id);
}

export async function botActionStop(id: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  return normalizeActionError(await botControlHandler(id, 'stop', userId), id);
}

export async function botActionPause(id: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  return normalizeActionError(await botControlHandler(id, 'pause', userId), id);
}

export async function botActionResume(id: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  return normalizeActionError(await botControlHandler(id, 'resume', userId), id);
}

// ── Killswitch Actions ──────────────────────────────────────────
export async function killswitchActionHalt(reason: string, userId?: string): Promise<{ ok: boolean }> {
  getBotManager().manualHalt(reason);
  await emergencyHalt(reason, userId);
  return { ok: true };
}

export async function killswitchActionResume(userId?: string): Promise<{ ok: boolean }> {
  getBotManager().manualResume();
  await resumeFromHalt(userId);
  return { ok: true };
}
