/**
 * GET /api/bots/{id} handler
 * Returns detail for a single bot from BotManager.
 */

import { getBotManager, type BotConfig } from '@/tree/bot';
import { BotInstance } from '@/tree/bot/bot-instance';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';
import { getRecentEvents } from '@/forest/dashboard/trade-events';
import type { TradeEvent } from '@/tree/telemetry';

export interface BotDetail {
  id: string;
  name: string;
  strategy: string;
  pair: string;
  exchange: string;
  status: string;
  capital: number;
  totalPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  currentDrawdown: number;
  startedAt: number | null;
  stoppedAt: number | null;
  lastTickAt: number | null;
  lastOrderAt: number | null;
  error: string | null;
  gridConfig?: Record<string, unknown>;
  recentEvents?: TradeEvent[];
}

export type BotControlAction = 'start' | 'stop' | 'pause' | 'resume';

export async function botDetailHandler(id: string): Promise<{
  ok: boolean;
  data?: BotDetail;
  error?: string;
}> {
  try {
    await loadAllBotsFromD1();
    const manager = getBotManager();
    const bot: BotInstance | undefined = manager.getBot(id);
    if (!bot) {
      return { ok: false, error: `Bot not found: ${id}` };
    }

    const snapshot = bot.getSnapshot();
    const config = bot.getConfig() as BotConfig;

    let gridConfig: Record<string, unknown> | undefined;
    if (config.strategy === 'grid') {
      const grid = config as unknown as Record<string, unknown>;
      gridConfig = {
        gridSpacingPct: grid.gridSpacingPct,
        gridLevels: grid.gridLevels,
        capitalPerLevelPct: grid.capitalPerLevelPct,
        takeProfitPct: grid.takeProfitPct,
        stopLossPct: grid.stopLossPct,
        rebalanceOnFill: grid.rebalanceOnFill,
      };
    }

    // Fetch recent trade events from D1
    const recentEvents = await getRecentEvents([id]);

    return {
      ok: true,
      data: {
        id: snapshot.id,
        strategy: config.strategy,
        pair: config.symbol,
        exchange: config.exchange ?? 'paper',
        name: config.name || snapshot.id,
        status: snapshot.status,
        capital: config.capital,
        totalPnl: snapshot.totalPnl,
        totalTrades: snapshot.totalTrades,
        winCount: snapshot.winCount,
        lossCount: snapshot.lossCount,
        maxDrawdown: snapshot.maxDrawdown,
        currentDrawdown: snapshot.currentDrawdown,
        startedAt: snapshot.startedAt,
        stoppedAt: snapshot.stoppedAt,
        lastTickAt: snapshot.lastTickAt,
        lastOrderAt: snapshot.lastOrderAt,
        error: snapshot.error,
        gridConfig,
        recentEvents,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to fetch bot detail' };
  }
}

export async function botControlHandler(
  botId: string,
  action: BotControlAction,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await loadAllBotsFromD1();
    const manager = getBotManager();
    const bot = manager.getBot(botId);
    if (!bot) return { ok: false, error: `Bot not found: ${botId}` };

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
        manager.resumeBot(botId);
        break;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `Control action ${action} failed` };
  }
}
