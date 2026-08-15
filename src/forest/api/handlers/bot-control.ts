/**
 * POST /api/bots/{id}/start /stop /pause /resume handler
 * Dispatches lifecycle actions to BotInstance.
 */

import { getBotManager } from '@/tree/bot';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';
import { createServerClient } from '@/lib/db/client';
import type { BotState } from '@/tree/bot/types';

async function validateStartCredentials(id: string): Promise<{ ok: boolean; error?: string }> {
  const bot = getBotManager().getBot(id);
  if (!bot) {
    return { ok: false, error: `Bot not found: ${id}` };
  }
  const snapshot = bot.getSnapshot() as BotState;
  const exchange = snapshot.exchange ?? snapshot.config?.exchange;
  const userId = snapshot.userId ?? snapshot.config?.userId;
  if (!exchange) {
    return { ok: false, error: 'Missing exchange credentials for bot. Please add API keys in settings.' };
  }
  const db = createServerClient();
  if (db) {
    try {
      const creds = await db.prepare(
        'SELECT api_key_encrypted, api_secret_encrypted, is_testnet FROM api_credentials WHERE exchange = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 1'
      ).bind(exchange, userId ?? null).first<{ api_key_encrypted?: string | null }>();
      if (!creds || !creds.api_key_encrypted) {
        return { ok: false, error: `Missing exchange credentials for ${exchange}. Please configure API keys first.` };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('no such table')) {
        return { ok: false, error: 'Credential store unavailable. Reconfigure on Settings page.' };
      }
    }
  }
  return { ok: true };
}

export async function botControlHandler(
  id: string,
  action: 'start' | 'stop' | 'pause' | 'resume',
): Promise<{ ok: boolean; error?: string }> {
  try {
    await loadAllBotsFromD1();
    const manager = getBotManager();
    if (!manager.getBot(id)) {
      return { ok: false, error: `Bot not found: ${id}` };
    }

    switch (action) {
      case 'start': {
        const preflight = await validateStartCredentials(id);
        if (!preflight.ok) return preflight;
        manager.getBot(id)!.start();
        break;
      }
      case 'stop':
        manager.getBot(id)!.stop();
        break;
      case 'pause':
        manager.getBot(id)!.pause();
        break;
      case 'resume':
        manager.resumeBot(id);
        break;
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `${action} failed` };
  }
}