export class AdmatiPfleidererEngine {
  public static analyzeIntradayClustering(config: AdmatiPfleidererConfig): AdmatiPfleidererResult {
    const { fundamentalVolatility: sigma, fixedExecutionCost: c0, sunshineDisclosureBonus: b, periods } = config;
    if (periods.length === 0) throw new Error('At least one period required');
    const totalVols = periods.map(p => p.nondiscretionaryVolume + p.discretionaryTraders * 10);
    const maxVol = Math.max(...totalVols);
    const metrics: AdmatiPeriodMetric[] = periods.map((p, idx) => {
      const activeDLT = p.discretionaryTraders;
      const totalPool = activeDLT + p.informedTraders + 1;
      const lambdaAdv = (sigma * p.informedTraders) / totalPool;
      const baseCost = c0 / (1 + activeDLT * 0.1);
      const effCost = Math.max(0, baseCost + lambdaAdv - b);
      return {
        periodIndex: p.periodIndex,
        totalVolume: totalVols[idx],
        effectiveAdverseSelection: lambdaAdv,
        expectedTransactionCost: effCost,
        isClusteredLiquidityPeak: totalVols[idx] === maxVol && maxVol > 0,
      };
    });
    const peakPeriod = metrics.find(m => m.isClusteredLiquidityPeak)?.periodIndex ?? 0;
    const costs = metrics.map(m => m.expectedTransactionCost);
    const avgCost = costs.reduce((a, bVal) => a + bVal, 0) / costs.length;
    const variance = costs.reduce((acc, c) => acc + Math.pow(c - avgCost, 2), 0) / costs.length;
    return { periods: metrics, highestLiquidityPeriod: peakPeriod, intradayCostDispersion: Math.sqrt(variance) };
  }
}

/**
 * Admati & Pfleiderer (1988) Volume Clustering & Sunshine Trading Types
 * Reference: Anat R. Admati & Paul Pfleiderer (1988), RFS
 */

export interface AdmatiPfleidererPeriodInput {
  periodIndex: number;
  nondiscretionaryVolume: number; // inelastic base flow
  discretionaryTraders: number; // DLT count choosing this period
  informedTraders: number; // Informed trader count
}

export interface AdmatiPfleidererConfig {
  fundamentalVolatility: number;
  fixedExecutionCost: number;
  sunshineDisclosureBonus: number; // Discount if orders pre-announced
  periods: AdmatiPfleidererPeriodInput[];
}

export interface AdmatiPeriodMetric {
  periodIndex: number;
  totalVolume: number;
  effectiveAdverseSelection: number;
  expectedTransactionCost: number;
  isClusteredLiquidityPeak: boolean;
}

export interface AdmatiPfleidererResult {
  periods: AdmatiPeriodMetric[];
  highestLiquidityPeriod: number;
  intradayCostDispersion: number;
}
