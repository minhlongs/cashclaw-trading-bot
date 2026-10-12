import type { KyleObizhaevaConfig, KyleObizhaevaImpactResult, KyleObizhaevaInvarianceConfig, KyleObizhaevaInvarianceResult } from './kyle-obizhaeva-invariance-types';
import { KyleObizhaevaImpactCalculator } from './kyle-obizhaeva-impact-calculator';

export class KyleObizhaevaInvarianceEngine {
  constructor(private readonly config: KyleObizhaevaConfig) {}
  getTradingVelocity(): number { return Math.max(1, this.config.dailyVolumeUsd) * Math.max(1e-6, this.config.dailyVolatility); }
  getInvariantBetSize(): number {
    const vSq = Math.pow(Math.max(1e-6, this.config.dailyVolatility), 2);
    return (this.config.betScaleConstant ?? 5.0) * Math.cbrt(Math.max(1, this.config.dailyVolumeUsd) / vSq);
  }
  computeImpact(orderSizeUsd: number): KyleObizhaevaImpactResult {
    return KyleObizhaevaImpactCalculator.computeImpact(this.config, orderSizeUsd, this.getTradingVelocity(), this.getInvariantBetSize());
  }
  public static calculateInvariants(c: KyleObizhaevaInvarianceConfig): KyleObizhaevaInvarianceResult {
    return KyleObizhaevaImpactCalculator.calculateInvariants(c);
  }
}
