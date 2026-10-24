export class RollImplicitSpreadEngine {
  public static calculateSpread(config: RollSpreadConfig): RollSpreadResult {
    const { priceChanges: dP, referencePrice } = config;
    if (dP.length < 2) throw new Error('Requires at least 2 price changes');
    const n = dP.length - 1;
    let mean1 = 0, mean2 = 0;
    for (let i = 0; i < n; i++) { mean1 += dP[i]; mean2 += dP[i + 1]; }
    mean1 /= n; mean2 /= n;
    let cov = 0;
    for (let i = 0; i < n; i++) cov += (dP[i] - mean1) * (dP[i + 1] - mean2);
    cov /= n;
    const isPos = cov > 0;
    const rollSpread = 2 * Math.sqrt(Math.max(0, -cov));
    const pct = referencePrice && referencePrice > 0 ? rollSpread / referencePrice : undefined;
    return { serialCovariance: cov, rollSpread, percentageSpread: pct, isPositiveCovariance: isPos };
  }
}

export interface RollSpreadConfig {
  priceChanges: readonly number[];
  referencePrice?: number;
}

export interface RollSpreadResult {
  serialCovariance: number;
  rollSpread: number;
  percentageSpread?: number;
  isPositiveCovariance: boolean;
}
