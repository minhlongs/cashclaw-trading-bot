/**
 * GET /api/bots handler
 * Returns list of all bots from BotManager.
 */

import { getBotManager, type BotConfig } from '@/tree/bot';
import { BotInstance } from '@/tree/bot/bot-instance';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';

export interface BotListItem {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  status: string;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  startedAt: number | null;
  updatedAt: number;
}

export async function botListHandler(): Promise<{
  ok: boolean;
  data?: BotListItem[];
  error?: string;
}> {
  try {
    await loadAllBotsFromD1();
    const manager = getBotManager();
    const bots: BotInstance[] = manager.getAllBots();

    const items: BotListItem[] = bots.map((bot) => {
      const snapshot = bot.getSnapshot();
      const config = bot.getConfig() as BotConfig;
      return {
        id: snapshot.id,
        name: snapshot.id,
        strategy: config.strategy,
        pair: config.symbol,
        exchange: config.exchange ?? 'paper',
        status: snapshot.status,
        totalPnl: snapshot.totalPnl,
        winCount: snapshot.winCount,
        lossCount: snapshot.lossCount,
        startedAt: snapshot.startedAt,
        updatedAt: snapshot.updatedAt,
      };
    });

    return { ok: true, data: items };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to list bots' };
  }
}
