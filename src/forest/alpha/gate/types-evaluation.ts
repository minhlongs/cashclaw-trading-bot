import type { GateCheck } from './types-checks';
import type { FinancialMetricsInput, StressMetricsInput, CandidateBaselineMetrics, BenchmarkMetrics, ReproducibleHashDetails } from './types-metrics';

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
