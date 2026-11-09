// Forest layer — Bot lifecycle actions (start, stop, pause, resume, killswitch)
// Thin wrappers around BotInstance methods with error handling.

'use server';

import { getBotManager } from '@/tree/bot';

async function resolveOwnedBot(id: string, userId?: string) {
  const manager = getBotManager();
  const bot = (userId ? manager.getBot(id, userId) : manager.getBot(id))
    ?? await (userId ? manager.getOrCreateBot?.(id, userId) : manager.getOrCreateBot?.(id));
  if (!bot) return null;
  const ownerId = manager.getBotOwnerId?.(id);
  if (userId && ownerId && ownerId !== userId) return null;
  return bot;
}

// ── Server Actions ──────────────────────────────────────────────
export async function botActionStart(id: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const bot = await resolveOwnedBot(id, userId);
    if (!bot) return { ok: false, error: 'Bot not found' };
    await bot.start();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Start failed' };
  }
}

export async function botActionStop(id: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const bot = await resolveOwnedBot(id, userId);
    if (!bot) return { ok: false, error: 'Bot not found' };
    bot.stop();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Stop failed' };
  }
}

export async function botActionPause(id: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const bot = await resolveOwnedBot(id, userId);
    if (!bot) return { ok: false, error: 'Bot not found' };
    bot.pause();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Pause failed' };
  }
}

export async function botActionResume(id: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = await resolveOwnedBot(id, userId);
    if (!bot) return { ok: false, error: 'Bot not found' };
    if (userId) manager.resumeBot(id, userId);
    else manager.resumeBot(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Resume failed' };
  }
}

// ── Killswitch Actions ──────────────────────────────────────────
export async function killswitchActionHalt(reason: string): Promise<{ ok: boolean }> {
  getBotManager().manualHalt(reason);
  return { ok: true };
}

export async function killswitchActionResume(): Promise<{ ok: boolean }> {
  getBotManager().manualResume();
  return { ok: true };
}
