import type { AbdiRanaldoConfig, AbdiRanaldoResult, ChlBar } from './abdi-ranaldo-types';
import { runAbdiRanaldo } from './abdi-ranaldo-estimator';

export class AbdiRanaldoEngine {
  public estimate(bars: readonly ChlBar[], method?: 'two-day-corrected' | 'pooled-truncated'): AbdiRanaldoResult {
    return AbdiRanaldoEngine.calculate({ bars, method });
  }

  public static calculate(config: AbdiRanaldoConfig): AbdiRanaldoResult {
    if (!config.bars || config.bars.length < 2) {
      throw new Error('Abdi-Ranaldo CHL spread estimation requires at least 2 bars');
    }
    return runAbdiRanaldo(config.bars, config.method ?? 'two-day-corrected');
  }
}
