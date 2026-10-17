import type { PastorStambaughBar, PastorStambaughConfig, PastorStambaughResult } from './pastor-stambaugh-types';
import { runPastorStambaugh } from './pastor-stambaugh-estimator';

export class PastorStambaughEngine {
  public estimate(bars: readonly PastorStambaughBar[]): PastorStambaughResult {
    return PastorStambaughEngine.calculate({ bars });
  }

  public static calculate(config: PastorStambaughConfig): PastorStambaughResult {
    if (!config.bars || config.bars.length < 3) {
      throw new Error('Pastor-Stambaugh liquidity estimation requires at least 3 daily bars');
    }
    return runPastorStambaugh(config.bars);
  }
}
