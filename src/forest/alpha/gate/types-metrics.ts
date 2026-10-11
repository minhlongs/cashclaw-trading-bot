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
