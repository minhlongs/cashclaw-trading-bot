import type { OhlcBar, RogersSatchellConfig, RogersSatchellResult } from './rogers-satchell-types';
import { runRsEstimation } from './rogers-satchell-estimator';

export class RogersSatchellVolatilityEngine {
  public estimate(bars: readonly OhlcBar[], config?: RogersSatchellConfig): RogersSatchellResult {
    return runRsEstimation(bars, config?.annualizationFactor ?? 365);
  }

  public static calculate(config: RogersSatchellConfig): RogersSatchellResult {
    if (!config.bars || config.bars.length === 0) throw new Error('At least one bar is required');
    if (config.bars.length < 2) throw new Error('Rogers-Satchell volatility estimation requires at least 2 bars.');
    return runRsEstimation(config.bars, config.annualizationFactor ?? 365);
  }
}
