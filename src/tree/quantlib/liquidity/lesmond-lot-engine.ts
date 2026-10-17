import type { LesmondLotConfig, LesmondLotResult } from './lesmond-lot-types';
import { runLesmondLot } from './lesmond-lot-estimator';

export class LesmondLotEngine {
  public estimate(returns: readonly number[], zeroTolerance = 1e-6): LesmondLotResult {
    return LesmondLotEngine.calculate({ returns, zeroTolerance });
  }

  public static calculate(config: LesmondLotConfig): LesmondLotResult {
    if (!config.returns || config.returns.length < 3) {
      throw new Error('Lesmond LOT estimation requires at least 3 return observations');
    }
    const tol = config.zeroTolerance ?? 1e-6;
    if (tol < 0) throw new Error('Zero tolerance must be non-negative');
    return runLesmondLot(config.returns, tol);
  }
}
