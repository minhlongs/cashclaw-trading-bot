import { getBotManager } from '@/tree/bot';
import type { BotControlAction } from './bot-detail-types';

export async function executeBotControl(
  botId: string,
  action: BotControlAction,
  userId?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = (userId ? manager.getBot(botId, userId) : manager.getBot(botId))
      ?? await (userId ? manager.getOrCreateBot(botId, userId) : manager.getOrCreateBot(botId));
    if (!bot) return { ok: false, error: `Bot not found: ${botId}` };
    const ownerId = manager.getBotOwnerId(botId);
    if (userId && ownerId && ownerId !== userId) {
      return { ok: false, error: `Bot not found: ${botId}` };
    }

    switch (action) {
      case 'start': await bot.start(); break;
      case 'stop': bot.stop(); break;
      case 'pause': bot.pause(); break;
      case 'resume':
        if (userId) manager.resumeBot(botId, userId);
        else manager.resumeBot(botId);
        break;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `Control action ${action} failed` };
  }
}
