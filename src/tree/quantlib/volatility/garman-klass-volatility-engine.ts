import type { OhlcBar, GarmanKlassConfig, GarmanKlassResult } from './garman-klass-volatility-types';
import { runGkEstimation } from './garman-klass-estimator';

export class GarmanKlassVolatilityEngine {
  public estimate(bars: readonly OhlcBar[], config?: GarmanKlassConfig): GarmanKlassResult {
    return runGkEstimation(bars, config?.annualizationFactor ?? 365);
  }

  public static calculate(config: GarmanKlassConfig): GarmanKlassResult {
    if (!config.bars || config.bars.length === 0) throw new Error('At least one bar is required');
    if (config.bars.length < 2) throw new Error('Garman-Klass volatility estimation requires at least 2 bars.');
    return runGkEstimation(config.bars, config.annualizationFactor ?? 365);
  }
}
