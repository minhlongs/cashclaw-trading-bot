export interface ChlBar {
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface AbdiRanaldoConfig {
  readonly bars: readonly ChlBar[];
  readonly method?: 'two-day-corrected' | 'pooled-truncated';
}

export interface AbdiRanaldoResult {
  readonly effectiveSpread: number;
  readonly effectiveSpreadBps: number;
  readonly meanMidRangeDeviation: number;
  readonly pairCount: number;
}
