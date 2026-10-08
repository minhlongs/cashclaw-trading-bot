export interface BotPerformanceRecord {
  readonly botId: string;
  readonly strategyKind: 'grid' | 'mean_reversion' | 'volatility_dca' | 'funding_arb';
  readonly returnsSeries: readonly number[];
  readonly currentAllocationUsd: number;
  readonly maxDrawdownPct: number;
}

export interface HrpAllocationResult {
  readonly allocations: Record<string, number>; // botId -> weight (0 to 1)
  readonly clusterOrder: readonly string[];
  readonly timestampMs: number;
}

export interface KellySizingResult {
  readonly fullKelly: number;
  readonly halfKelly: number;
  readonly recommendedLeverage: number;
  readonly safeCapReached: boolean;
}

export interface CircuitBreakerStatus {
  readonly isTriggered: boolean;
  readonly portfolioDrawdownPct: number;
  readonly reason: string | null;
  readonly actionRequired: 'none' | 'reduce_risk' | 'emergency_pause_all';
}
