// Statistical Arbitrage Contracts — Kalman Filter & OU Mean-Reversion
export interface KalmanState {
  readonly alpha: number; // Intercept
  readonly beta: number; // Dynamic Hedge Ratio
  readonly p00: number; // Covariance element (0,0)
  readonly p01: number; // Covariance element (0,1)
  readonly p10: number; // Covariance element (1,0)
  readonly p11: number; // Covariance element (1,1)
}

export interface KalmanFilterConfig {
  readonly processNoiseVar: number; // Q diagonal element, e.g. 1e-5
  readonly measurementNoiseVar: number; // R variance, e.g. 1e-3
}

export interface OuProcessMetrics {
  readonly theta: number; // Mean reversion speed
  readonly mu: number; // Long-term equilibrium mean
  readonly sigma: number; // Volatility of the process
  readonly halfLifeBars: number; // Time in bars to revert 50%
  readonly equilibriumStd: number; // Equilibrium standard deviation
}

export type StatArbAction = 'ENTER_LONG_SPREAD' | 'ENTER_SHORT_SPREAD' | 'EXIT_SPREAD' | 'HOLD';

export interface StatArbSignalResult {
  readonly action: StatArbAction;
  readonly zScore: number;
  readonly spread: number;
  readonly hedgeRatio: number;
  readonly reason: string;
}
