import { getBotManager } from '@/tree/bot';
import type { BotControlAction } from './bot-detail-types';

export async function executeBotControl(
  botId: string, action: BotControlAction, ownerUserId?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(botId, ownerUserId) ?? await manager.getOrCreateBot(botId, ownerUserId);
    if (!bot) return { ok: false, error: `Bot not found: ${botId}` };

    switch (action) {
      case 'start': await bot.start(); break;
      case 'stop': bot.stop(); break;
      case 'pause': bot.pause(); break;
      case 'resume':
        if (ownerUserId === undefined) manager.resumeBot(botId);
        else manager.resumeBot(botId, ownerUserId);
        break;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `Control action ${action} failed` };
  }
}
