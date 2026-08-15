import { getBotManager, type CreateBotRequest } from '@/tree/bot';
import type { GridBotConfig, MeanRevBotConfig } from '@/tree/bot/types';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';

function normalizeWizardConfig(raw?: Record<string, number>): Record<string, number> {
  const aliases: Record<string, string> = {
    spacing_pct: 'gridSpacingPct',
    spacingPct: 'gridSpacingPct',
    grid_levels: 'gridLevels',
    gridLevels: 'gridLevels',
    capital_per_level_pct: 'capitalPerLevelPct',
    capitalPerLevelPct: 'capitalPerLevelPct',
    take_profit_pct: 'takeProfitPct',
    takeProfitPct: 'takeProfitPct',
    stop_loss_pct: 'stopLossPct',
    stopLossPct: 'stopLossPct',
    max_drawdown_pct: 'maxDrawdownPct',
    maxDrawdownPct: 'maxDrawdownPct',
    bb_period: 'bbPeriod',
    bbPeriod: 'bbPeriod',
    bb_std: 'bbStdDev',
    bbStdDev: 'bbStdDev',
    rsi_period: 'rsiPeriod',
    rsiPeriod: 'rsiPeriod',
    rsi_buy: 'rsiBuyThreshold',
    rsiBuyThreshold: 'rsiBuyThreshold',
    rsi_sell: 'rsiSellThreshold',
    rsiSellThreshold: 'rsiSellThreshold',
    volume_multiplier: 'volumeMultiplier',
    volumeMultiplier: 'volumeMultiplier',
    position_size_pct: 'positionSizePct',
    positionSizePct: 'positionSizePct',
    cooldown_minutes: 'cooldownMinutes',
    cooldownMinutes: 'cooldownMinutes',
    lookback_period: 'lookbackPeriod',
    lookbackPeriod: 'lookbackPeriod',
    zscore_threshold: 'zScoreThreshold',
    zScoreThreshold: 'zScoreThreshold',
  };
  const out: Record<string, number> = {};
  for (const src in raw ?? {}) {
    const normalized = src.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const name = aliases[normalized] ?? aliases[src] ?? src;
    out[name] = (raw as Record<string, number>)[src];
  }
  return out;
}

type CoerceArgs = {
  config: Record<string, number> | undefined;
  key: string;
  defaultValue: number;
  min: number;
  max: number;
};

function coerceNum({ config, key, defaultValue, min, max }: CoerceArgs): number {
  const raw = config?.[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return defaultValue;
  }
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
    if (payload.mode === 'live') {
      return {
        ok: false,
        error: 'Live trading not available in v1 — paper mode only',
      };
    }

    await loadAllBotsFromD1();

    const cfg = normalizeWizardConfig(payload.config);
    const base = {
      name: payload.name,
      symbol: payload.pair,
      exchange: payload.exchange,
      mode: 'paper' as const,
      capital: payload.capital,
      maxDrawdownPct: coerceNum({ config: cfg, key: 'maxDrawdownPct', defaultValue: 10, min: 1, max: 50 }),
    };

    const strategyConfig =
      payload.strategy === 'grid'
        ? ({
            ...base,
            strategy: 'grid' as const,
            gridSpacingPct: coerceNum({ config: cfg, key: 'gridSpacingPct', defaultValue: 1, min: 0.1, max: 20 }),
            gridLevels: coerceNum({ config: cfg, key: 'gridLevels', defaultValue: 10, min: 2, max: 200 }),
            capitalPerLevelPct: coerceNum({ config: cfg, key: 'capitalPerLevelPct', defaultValue: 10, min: 1, max: 100 }),
            takeProfitPct: coerceNum({ config: cfg, key: 'takeProfitPct', defaultValue: 2, min: 0.1, max: 50 }),
            stopLossPct: coerceNum({ config: cfg, key: 'stopLossPct', defaultValue: 5, min: 0.1, max: 50 }),
            rebalanceOnFill: false,
          } satisfies GridBotConfig)
        : ({
            ...base,
            strategy: 'mean_reversion' as const,
            bbPeriod: coerceNum({ config: cfg, key: 'bbPeriod', defaultValue: 20, min: 2, max: 200 }),
            bbStdDev: coerceNum({ config: cfg, key: 'bbStdDev', defaultValue: 2, min: 0.5, max: 5 }),
            rsiPeriod: coerceNum({ config: cfg, key: 'rsiPeriod', defaultValue: 14, min: 2, max: 100 }),
            rsiBuyThreshold: coerceNum({ config: cfg, key: 'rsiBuyThreshold', defaultValue: 30, min: 5, max: 50 }),
            rsiSellThreshold: coerceNum({ config: cfg, key: 'rsiSellThreshold', defaultValue: 70, min: 50, max: 95 }),
            volumeMultiplier: coerceNum({ config: cfg, key: 'volumeMultiplier', defaultValue: 1.5, min: 0.1, max: 10 }),
            positionSizePct: coerceNum({ config: cfg, key: 'positionSizePct', defaultValue: 10, min: 1, max: 100 }),
            cooldownMinutes: coerceNum({ config: cfg, key: 'cooldownMinutes', defaultValue: 5, min: 0, max: 60 }),
          } satisfies MeanRevBotConfig);

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

    const manager = getBotManager();
    await manager.createBot(botConfig);

    return { ok: true, data: { id: payload.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create bot' };
  }
}
