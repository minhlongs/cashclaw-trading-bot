/**
 * POST /api/bots — create a new bot
 * Persists bot config to D1 and creates BotInstance in memory.
 * v1: paper mode only — 'live' is rejected at the API level.
 */

import { getBotManager, type CreateBotRequest } from '@/tree/bot';
import type { GridBotConfig, MeanRevBotConfig } from '@/tree/bot/types';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';

/** Coerce a numeric config value, clamping to [min, max] and falling back to defaultValue. */
function coerceNum(
  config: Record<string, number> | undefined,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const raw = config?.[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return defaultValue;
  return Math.min(max, Math.max(min, raw));
}

export interface CreateBotPayload {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  capital: number;
  config?: Record<string, number>;
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
    const cfg = payload.config;

    const baseConfig = {
      name: payload.name,
      symbol: payload.pair,
      exchange: payload.exchange,
      mode: 'paper' as const,
      capital: payload.capital,
      maxDrawdownPct: coerceNum(cfg, 'max_drawdown_pct', 10, 1, 50),
    };

    const strategyConfig = payload.strategy === 'grid'
      ? {
          ...baseConfig,
          strategy: 'grid' as const,
          gridSpacingPct: coerceNum(cfg, 'spacing_pct', 1, 0.1, 20),
          gridLevels: coerceNum(cfg, 'grid_levels', 10, 2, 200),
          capitalPerLevelPct: coerceNum(cfg, 'capital_per_level_pct', 10, 1, 100),
          takeProfitPct: coerceNum(cfg, 'take_profit_pct', 2, 0.1, 50),
          stopLossPct: coerceNum(cfg, 'stop_loss_pct', 5, 0.1, 50),
          rebalanceOnFill: false,
        } satisfies GridBotConfig
      : {
          ...baseConfig,
          strategy: 'mean_reversion' as const,
          bbPeriod: coerceNum(cfg, 'bb_period', 20, 2, 200),
          bbStdDev: coerceNum(cfg, 'bb_std_dev', 2, 0.5, 5),
          rsiPeriod: coerceNum(cfg, 'rsi_period', 14, 2, 100),
          rsiBuyThreshold: coerceNum(cfg, 'rsi_buy_threshold', 30, 5, 50),
          rsiSellThreshold: coerceNum(cfg, 'rsi_sell_threshold', 70, 50, 95),
          volumeMultiplier: coerceNum(cfg, 'volume_multiplier', 1.5, 0.1, 10),
          positionSizePct: coerceNum(cfg, 'position_size_pct', 10, 1, 100),
          cooldownMinutes: coerceNum(cfg, 'cooldown_minutes', 5, 0, 60),
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