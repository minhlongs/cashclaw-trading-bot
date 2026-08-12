/**
 * POST /api/bots/{id}/start /stop /pause /resume handler
 * Dispatches lifecycle actions to BotInstance.
 */

import { getBotManager } from '@/tree/bot';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';

export async function botControlHandler(
  id: string,
  action: 'start' | 'stop' | 'pause' | 'resume',
): Promise<{ ok: boolean; error?: string }> {
  try {
    await loadAllBotsFromD1();
    const manager = getBotManager();
    const bot = manager.getBot(id);
    if (!bot) {
      return { ok: false, error: `Bot not found: ${id}` };
    }

    switch (action) {
      case 'start':
        await bot.start();
        break;
      case 'stop':
        bot.stop();
        break;
      case 'pause':
        bot.pause();
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
