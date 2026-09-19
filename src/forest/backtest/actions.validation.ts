import type { BotConfig, VolatilityDcaBotConfig } from '@/tree/bot/types';

export const SUPPORTED_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type CandleInterval = (typeof SUPPORTED_INTERVALS)[number];

export function validateBacktestInput(input: { startDate: Date; endDate: Date; config: BotConfig }, interval: CandleInterval): string | null {
  if (!SUPPORTED_INTERVALS.includes(interval)) return `Unsupported interval: ${interval}`;
  if (input.endDate.getTime() <= input.startDate.getTime()) return 'endDate must be after startDate';
  const threeYearsMs = 3 * 365 * 24 * 3600 * 1000;
  if (input.endDate.getTime() - input.startDate.getTime() > threeYearsMs) return 'Date range exceeds 3-year limit';

  const validStrategies = ['grid', 'mean_reversion', 'volatility_dca'];
  if (!validStrategies.includes(input.config.strategy)) {
    return `Unsupported strategy: ${input.config.strategy}`;
  }

  if (input.config.strategy === 'volatility_dca') {
    const cfg = input.config as VolatilityDcaBotConfig;
    if (!cfg.priceDropStep || cfg.priceDropStep <= 0) return 'priceDropStep must be positive';
    if (!cfg.maxSteps || cfg.maxSteps <= 0) return 'maxSteps must be positive';
    if (!cfg.volBaseline || cfg.volBaseline <= 0) return 'volBaseline must be positive';
    if (!cfg.baseOrderSizePct || cfg.baseOrderSizePct <= 0) return 'baseOrderSizePct must be positive';
  }

  return null;
}
