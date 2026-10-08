/**
 * Core type contracts for Alpha Research OS Phase 9: Promotion Gate.
 * Enforces 15-point conjunctive verification and lifecycle safety capping.
 */

export type GateCheckName =
  | 'min_trades'
  | 'min_net_expectancy'
  | 'min_profit_factor'
  | 'max_drawdown'
  | 'min_sharpe_sortino'
  | 'min_regime_coverage'
  | 'fee_stress'
  | 'slippage_stress'
  | 'parameter_robustness'
  | 'cross_period_robustness'
  | 'cross_asset_robustness'
  | 'leakage_invariance'
  | 'no_single_window_dependency'
  | 'baseline_comparison'
  | 'reproducible_hash';

export interface GateCheck {
  readonly name: GateCheckName;
  readonly passed: boolean;
  readonly actual: number | string | boolean | null;
  readonly threshold: number | string | boolean;
  readonly detail: string;
}

export interface PromotionGateConfig {
  readonly minTrades: number;
  readonly minNetExpectancy: number;
  readonly minProfitFactor: number;
  readonly maxDrawdown: number;
  readonly minSharpe: number;
  readonly minSortino: number;
  readonly minRegimeCoverage: number;
  readonly maxParameterSpread: number;
  readonly minCrossPeriodConsistency: number;
  readonly minCrossAssetConsistency: number;
  readonly maxSingleWindowContribution: number;
}

export const DEFAULT_PROMOTION_GATE_CONFIG: PromotionGateConfig = {
  minTrades: 30,
  minNetExpectancy: 0.0,
  minProfitFactor: 1.2,
  maxDrawdown: 0.25,
  minSharpe: 1.0,
  minSortino: 1.2,
  minRegimeCoverage: 0.50,
  maxParameterSpread: 0.50,
  minCrossPeriodConsistency: 0.60,
  minCrossAssetConsistency: 0.50,
  maxSingleWindowContribution: 0.50,
};

export interface RegimePerformance {
  readonly numTrades?: number;
  readonly netPnl?: number;
}

export interface FinancialMetricsInput {
  readonly numTrades: number;
  readonly expectancy: number;
  readonly profitFactor: number;
  readonly maxDrawdown: number;
  readonly sharpe: number | null;
  readonly sortino: number | null;
  readonly byRegime: Record<string, RegimePerformance | undefined | null>;
}

export interface StressMetricsInput {
  readonly netPnlNormal: number;
  readonly netPnlConservative: number;
  readonly netPnlAdverse: number;
  readonly netPnlExtreme: number;
}

export interface CandidateBaselineMetrics {
  readonly sharpe: number;
  readonly netPnl: number;
}

export interface BenchmarkMetrics {
  readonly sharpe: number | null;
  readonly netPnl: number;
}

export interface ReproducibleHashDetails {
  readonly recordedHash?: string;
  readonly expectedHash?: string;
}

export interface RobustnessMetricsInput {
  readonly parameterSpread: number;
  readonly crossPeriodPositiveFraction: number;
  readonly crossAssetPositiveFraction?: number | null;
  readonly crossAssetApplicable?: boolean;
  readonly leakageViolations: number;
  readonly windowPnls: readonly number[];
  readonly baselineCandidate: CandidateBaselineMetrics;
  readonly baselineBuyHold: BenchmarkMetrics;
  readonly baselineRandomEntry: BenchmarkMetrics;
  readonly hashMatches: boolean;
  readonly hashDetails?: ReproducibleHashDetails | string;
}

export interface PromotionGateInput {
  readonly financial: FinancialMetricsInput;
  readonly stress: StressMetricsInput;
  readonly robustness: RobustnessMetricsInput;
}

export interface PromotionGateResult {
  readonly passed: boolean;
  readonly verdict: 'PASSED' | 'KILLED';
  readonly checks: readonly GateCheck[];
  readonly failedChecks: readonly GateCheck[];
  readonly diagnosticReasons: readonly string[];
  readonly timestamp: number;
}
