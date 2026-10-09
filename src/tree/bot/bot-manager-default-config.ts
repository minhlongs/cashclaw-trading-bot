import type { BotConfig, VolatilityDcaBotConfig } from './types';

export function defaultConfigFromRow(row: { name: string; pair: string; exchange: string; strategy: string; capital_allocated: number }): BotConfig {
  const base = { name: row.name, symbol: row.pair, exchange: row.exchange, mode: 'paper' as const, capital: row.capital_allocated, maxDrawdownPct: 15 };
  if (row.strategy === 'mean_reversion') {
    return { ...base, strategy: 'mean_reversion' as const, bbPeriod: 20, bbStdDev: 2, rsiPeriod: 14, rsiBuyThreshold: 30, rsiSellThreshold: 70, volumeMultiplier: 1, positionSizePct: 10, cooldownMinutes: 5 };
  }
  if (row.strategy === 'volatility_dca') {
    return {
      ...base,
      strategy: 'volatility_dca' as const,
      pair: row.pair,
      priceDropStep: 1.5,
      maxSteps: 6,
      baseOrderSizePct: 10,
      volatilityWindow: 20,
      volBaseline: 50,
      reboundTarget: 1.0,
    } satisfies VolatilityDcaBotConfig;
  }
  return { ...base, strategy: 'grid' as const, gridSpacingPct: 0.5, gridLevels: 5, capitalPerLevelPct: 20, takeProfitPct: 1, stopLossPct: 1, rebalanceOnFill: false };
}
