// Forest layer — Bot lifecycle actions (start, stop, pause, resume, killswitch)
// Thin wrappers around BotInstance methods with error handling.

'use server';

import { getBotManager } from '@/tree/bot';

// ── Server Actions ──────────────────────────────────────────────
export async function botActionStart(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(id);
    if (!bot) return { ok: false, error: 'Bot not found in memory' };
    await bot.start();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Start failed' };
  }
}

export async function botActionStop(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(id);
    if (!bot) return { ok: false, error: 'Bot not found in memory' };
    bot.stop();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Stop failed' };
  }
}

export async function botActionPause(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(id);
    if (!bot) return { ok: false, error: 'Bot not found in memory' };
    bot.pause();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Pause failed' };
  }
}

export async function botActionResume(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(id);
    if (!bot) return { ok: false, error: 'Bot not found in memory' };
    manager.resumeBot(id);
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
