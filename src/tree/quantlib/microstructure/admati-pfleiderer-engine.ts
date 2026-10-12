import {
  AdmatiPfleidererConfig,
  AdmatiPeriodMetric,
  AdmatiPfleidererResult,
} from './admati-pfleiderer-types';

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
