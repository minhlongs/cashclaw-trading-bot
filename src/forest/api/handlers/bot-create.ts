/**
 * POST /api/bots — create a new bot
 * Persists bot config to D1 and creates BotInstance in memory.
 * v1: paper mode only — 'live' is rejected at the API level.
 */

import { getBotManager, type CreateBotRequest } from '@/tree/bot';
import type { GridBotConfig, MeanRevBotConfig } from '@/tree/bot/types';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';

export interface CreateBotPayload {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  capital: number;
  config: Record<string, number>;
  mode?: 'paper' | 'live';
}

export async function botCreateHandler(
  payload: CreateBotPayload
): Promise<{ ok: boolean; data?: { id: string }; error?: string }> {
  try {
    // v1: hard-block live trading — paper mode only
    if (payload.mode === 'live') {
      return {
        ok: false,
        error: 'Live trading not available in v1 — paper mode only',
      };
    }

    await loadAllBotsFromD1();
    const manager = getBotManager();

    // Map payload to CreateBotRequest — always paper in v1
    const baseConfig = {
      name: payload.name,
      symbol: payload.pair,
      exchange: payload.exchange,
      mode: 'paper' as const,
      capital: payload.capital,
      maxDrawdownPct: 10,
    };

    const strategyConfig = payload.strategy === 'grid'
      ? {
          ...baseConfig,
          strategy: 'grid' as const,
          gridSpacingPct: 1,
          gridLevels: 10,
          capitalPerLevelPct: 10,
          takeProfitPct: 2,
          stopLossPct: 5,
          rebalanceOnFill: false,
        } satisfies GridBotConfig
      : {
          ...baseConfig,
          strategy: 'mean_reversion' as const,
          bbPeriod: 20,
          bbStdDev: 2,
          rsiPeriod: 14,
          rsiBuyThreshold: 30,
          rsiSellThreshold: 70,
          volumeMultiplier: 1.5,
          positionSizePct: 10,
          cooldownMinutes: 5,
        } satisfies MeanRevBotConfig;

    const botConfig: CreateBotRequest = {
      id: payload.id,
      config: strategyConfig,
      exchangeConfig: {
        apiKey: '',
        apiSecret: '',
        passphrase: '',
        testnet: true,
        sandbox: true,
        rateLimitMs: 100,
      },
      mode: 'paper',
    };

    await manager.createBot(botConfig);

    return { ok: true, data: { id: payload.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create bot' };
  }
}