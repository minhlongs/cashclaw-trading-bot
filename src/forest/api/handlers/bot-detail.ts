import { getBotManager, type BotConfig } from '@/tree/bot';
import { getRecentEvents } from '@/forest/dashboard/trade-events';
import { type BotDetail, type BotControlAction, extractGridConfig } from './bot-detail-types';
import { executeBotControl } from './bot-detail-control';

export type { BotDetail, BotControlAction };

export async function botDetailHandler(id: string): Promise<{ ok: boolean; data?: BotDetail; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(id) ?? await manager.getOrCreateBot(id);
    if (!bot) return { ok: false, error: `Bot not found: ${id}` };

    const snapshot = bot.getSnapshot();
    const config = bot.getConfig() as BotConfig;
    const gridConfig = extractGridConfig(config);
    const recentEvents = await getRecentEvents([id]);

    return {
      ok: true,
      data: {
        id: snapshot.id, strategy: config.strategy, pair: config.symbol, exchange: config.exchange ?? 'paper',
        name: config.name || snapshot.id, status: snapshot.status, capital: config.capital,
        totalPnl: snapshot.totalPnl, totalTrades: snapshot.totalTrades, winCount: snapshot.winCount,
        lossCount: snapshot.lossCount, maxDrawdown: snapshot.maxDrawdown, currentDrawdown: snapshot.currentDrawdown,
        startedAt: snapshot.startedAt, stoppedAt: snapshot.stoppedAt, lastTickAt: snapshot.lastTickAt,
        lastOrderAt: snapshot.lastOrderAt, error: snapshot.error, gridConfig, recentEvents,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to fetch bot detail' };
  }
}

export async function botControlHandler(botId: string, action: BotControlAction): Promise<{ ok: boolean; error?: string }> {
  return executeBotControl(botId, action);
}
