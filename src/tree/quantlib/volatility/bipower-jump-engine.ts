import type { BipowerJumpConfig, BipowerJumpResult } from './bipower-jump-types';
import { runBipowerJumpEstimation } from './bipower-jump-estimator';

export class BipowerJumpEngine {
  public estimate(returns: readonly number[], config?: BipowerJumpConfig): BipowerJumpResult {
    return runBipowerJumpEstimation(returns, config?.significanceLevel ?? 0.05);
  }

  public static calculate(config: BipowerJumpConfig): BipowerJumpResult {
    if (!config.returns || config.returns.length === 0) throw new Error('At least one return is required');
    if (config.returns.length < 3) throw new Error('Bipower jump detection requires at least 3 returns.');
    return runBipowerJumpEstimation(config.returns, config.significanceLevel ?? 0.05);
  }
}
