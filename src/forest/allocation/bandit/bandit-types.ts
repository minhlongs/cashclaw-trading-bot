export type VolatilityRegime = 'LOW_VOL_CHOP' | 'TRENDING_MOMENTUM' | 'HIGH_VOL_CRISIS';

export interface StrategyPerformanceReward {
  readonly strategyId: string;
  readonly sortinoRatio: number;
  readonly maxDrawdownPct: number;
  readonly winRatePct: number;
}

export interface BanditArmState {
  readonly strategyId: string;
  readonly alpha: number; // Cumulative pseudo-successes
  readonly beta: number; // Cumulative pseudo-failures
}

export interface StrategyWeightAllocation {
  readonly strategyId: string;
  readonly targetWeightPct: number;
  readonly sampledTheta: number;
  readonly regimeBiasApplied: boolean;
}
