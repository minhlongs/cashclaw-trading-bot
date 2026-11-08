/**
 * POST /api/bots/{id}/start /stop /pause /resume handler
 * Dispatches lifecycle actions to BotInstance.
 */

import { getBotManager } from '@/tree/bot';
import { createServerClient } from '@/lib/db/client';

async function validateStartCredentials(
  id: string,
  userId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const manager = getBotManager();
  const bot = userId ? manager.getBot(id, userId) : manager.getBot(id);
  if (!bot) {
    return { ok: false, error: `Bot not found: ${id}` };
  }
  const ownerId = (bot as { userId?: string | null }).userId;
  if (userId && ownerId && ownerId !== userId) {
    return { ok: false, error: `Bot not found: ${id}` };
  }
  const exchange = (bot as { exchange?: string }).exchange;
  if (!exchange) {
    return { ok: false, error: 'Missing exchange credentials for bot. Please add API keys in settings.' };
  }
  // Scope credential lookup to the bot owner when available to prevent cross-user IDOR
  const effectiveUserId = userId ?? ownerId ?? null;
  const db = createServerClient();
  if (db) {
    try {
      const creds = await db.prepare(
        'SELECT api_key_encrypted, api_secret_encrypted, is_testnet FROM api_credentials WHERE exchange = ? AND (user_id = ? OR user_id IS NULL) ORDER BY updated_at DESC LIMIT 1'
      ).bind(exchange, effectiveUserId).first<{ api_key_encrypted?: string | null }>();
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

async function resolveAuthorizedBot(
  id: string,
  userId?: string,
) {
  const manager = getBotManager();
  const bot = (userId ? manager.getBot(id, userId) : manager.getBot(id))
    ?? await (userId ? manager.getOrCreateBot(id, userId) : manager.getOrCreateBot(id));
  if (!bot) return null;
  const ownerId = (bot as { userId?: string | null }).userId;
  if (userId && ownerId && ownerId !== userId) return null;
  return bot;
}

export async function botControlHandler(
  id: string,
  action: 'start' | 'stop' | 'pause' | 'resume',
  userId?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = await resolveAuthorizedBot(id, userId);
    if (!bot) {
      return { ok: false, error: `Bot not found: ${id}` };
    }

    switch (action) {
      case 'start': {
        const preflight = await validateStartCredentials(id, userId);
        if (!preflight.ok) return preflight;
        await bot.start();
        break;
      }
      case 'stop':
        bot.stop();
        break;
      case 'pause':
        bot.pause();
        break;
      case 'resume':
        if (userId) manager.resumeBot(id, userId);
        else manager.resumeBot(id);
        break;
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `${action} failed` };
  }
}