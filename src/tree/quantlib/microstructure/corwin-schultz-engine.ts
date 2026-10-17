import type { CorwinSchultzConfig, CorwinSchultzResult, HighLowBar } from './corwin-schultz-types';
import { runCorwinSchultz } from './corwin-schultz-estimator';

export class CorwinSchultzEngine {
  public estimate(bars: readonly HighLowBar[], clampNegativeSpread = true): CorwinSchultzResult {
    return CorwinSchultzEngine.calculate({ bars, clampNegativeSpread });
  }

  public static calculate(config: CorwinSchultzConfig): CorwinSchultzResult {
    if (!config.bars || config.bars.length < 2) {
      throw new Error('Corwin-Schultz spread estimation requires at least 2 high-low bars');
    }
    return runCorwinSchultz(config.bars, config.clampNegativeSpread ?? true);
  }
}
