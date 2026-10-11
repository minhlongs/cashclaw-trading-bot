import type { Candle } from '@/forest/backtest/ohlcv';
import type { FundingRatePoint, OpenInterestPoint, LiquidationPoint, DerivativeFeatures } from './funding-types';
import { fundingFields, oiFields } from './funding-fields';
import { liquidationFields, basisFields } from './liquidation-fields';

export { rollingMean, rollingStd } from './funding-stats';
export { fundingFields, oiFields } from './funding-fields';
export { liquidationFields, basisFields } from './liquidation-fields';

export function computeDerivativeFeatures(
  candles: Candle[], funding: FundingRatePoint[], oi: OpenInterestPoint[], liquidations: LiquidationPoint[],
  premiumIndex: { timestamp: number; basis: number }[] = [], lookbackBars = 20,
): DerivativeFeatures[] {
  const result: DerivativeFeatures[] = [];
  const candleIntervalMs = candles.length >= 2 ? candles[1].timestamp - candles[0].timestamp : 4 * 3_600_000;
  for (const candle of candles) {
    const t = candle.timestamp;
    result.push({
      timestamp: t,
      ...fundingFields(funding, t),
      ...oiFields(oi, t, lookbackBars),
      ...liquidationFields(liquidations, t, lookbackBars, candleIntervalMs),
      ...basisFields(premiumIndex, t, lookbackBars),
    });
  }
  return result;
}
