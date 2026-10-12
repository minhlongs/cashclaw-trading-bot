import type { OhlcBar, YangZhangConfig, YangZhangResult } from './yang-zhang-volatility-types';
import { runYzEstimation } from './yang-zhang-estimator';

export class YangZhangVolatilityEngine {
  public estimate(bars: readonly OhlcBar[], config?: YangZhangConfig): YangZhangResult {
    return runYzEstimation(bars, config?.annualizationFactor ?? 365);
  }

  public static calculate(config: YangZhangConfig): YangZhangResult {
    if (!config.bars) throw new Error('At least 3 bars required for Yang-Zhang estimator');
    return runYzEstimation(config.bars, config.annualizationFactor ?? 365);
  }
}
