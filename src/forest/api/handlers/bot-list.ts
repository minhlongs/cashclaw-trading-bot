/**
 * GET /api/bots handler
 * Returns list of all bots — reads directly from D1, no BotManager hydration.
 */

import { BotQueryService } from '@/forest/bot/d1-adapter';

export interface BotListItem {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion' | 'volatility_dca';
  pair: string;
  exchange: string;
  status: string;
  capitalAllocated: number;
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
    const service = new BotQueryService();
    const bots = await service.listBots();

    const items: BotListItem[] = bots.map((bot) => ({
      id: bot.id,
      name: bot.name || bot.id,
      strategy: bot.strategy as 'grid' | 'mean_reversion' | 'volatility_dca',
      pair: bot.pair,
      exchange: bot.exchange,
      status: bot.status,
      totalPnl: bot.metrics.totalPnl,
      winCount: bot.metrics.winCount,
      lossCount: bot.metrics.lossCount,
      startedAt: bot.metrics.startedAt,
      updatedAt: bot.updatedAt,
      capitalAllocated: bot.config.capital,
    }));

    return { ok: true, data: items };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to list bots' };
  }
}
