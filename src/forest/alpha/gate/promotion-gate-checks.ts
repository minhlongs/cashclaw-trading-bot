import { checkMinTrades, checkMinNetExpectancy, checkMinProfitFactor, checkMaxDrawdown, checkMinSharpeSortino, checkMinRegimeCoverage } from './financial-checks';
import { checkFeeStress, checkSlippageStress } from './stress-checks';
import { checkParameterRobustness, checkCrossPeriodRobustness, checkCrossAssetRobustness, checkLeakageInvariance, checkNoSingleWindowDependency, checkBaselineComparison, checkReproducibleHash } from './robustness-checks';
import type { GateCheck, PromotionGateConfig, PromotionGateInput } from './types';

export function buildPromotionGateChecks(input: PromotionGateInput, cfg: PromotionGateConfig): readonly GateCheck[] {
  return [
    checkMinTrades(input.financial.numTrades, cfg.minTrades),
    checkMinNetExpectancy(input.financial.expectancy, cfg.minNetExpectancy),
    checkMinProfitFactor(input.financial.profitFactor, cfg.minProfitFactor),
    checkMaxDrawdown(input.financial.maxDrawdown, cfg.maxDrawdown),
    checkMinSharpeSortino(input.financial.sharpe, input.financial.sortino, cfg.minSharpe, cfg.minSortino),
    checkMinRegimeCoverage(input.financial.byRegime, cfg.minRegimeCoverage),
    checkFeeStress(input.stress.netPnlNormal, input.stress.netPnlConservative),
    checkSlippageStress(input.stress.netPnlAdverse, input.stress.netPnlExtreme),
    checkParameterRobustness(input.robustness.parameterSpread, cfg.maxParameterSpread),
    checkCrossPeriodRobustness(input.robustness.crossPeriodPositiveFraction, cfg.minCrossPeriodConsistency),
    checkCrossAssetRobustness(input.robustness.crossAssetPositiveFraction, input.robustness.crossAssetApplicable, cfg.minCrossAssetConsistency),
    checkLeakageInvariance(input.robustness.leakageViolations),
    checkNoSingleWindowDependency(input.robustness.windowPnls, cfg.maxSingleWindowContribution),
    checkBaselineComparison(input.robustness.baselineCandidate, input.robustness.baselineBuyHold, input.robustness.baselineRandomEntry),
    checkReproducibleHash(input.robustness.hashMatches, input.robustness.hashDetails),
  ];
}
