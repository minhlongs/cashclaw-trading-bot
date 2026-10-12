import type { ParkinsonConfig, ParkinsonResult } from './parkinson-volatility-types';

export class ParkinsonVolatilityEngine {
  public static calculate(config: ParkinsonConfig): ParkinsonResult {
    const { bars, annualizationFactor = 365 } = config;
    if (bars.length === 0) throw new Error('At least one bar is required');
    let sum = 0;
    const factor = 1 / (4 * Math.LN2);
    for (const b of bars) {
      if (b.high <= 0 || b.low <= 0 || b.high < b.low) throw new Error('Invalid high/low values');
      const hl = Math.log(b.high / b.low);
      sum += Math.pow(hl, 2);
    }
    const rawVariance = Math.max(0, (factor * sum) / bars.length);
    return {
      rawVariance,
      annualizedVolatility: Math.sqrt(rawVariance * annualizationFactor),
      barCount: bars.length,
      constantMultiplier: factor,
    };
  }
}
