/**
 * @file lead-lag-types.ts
 * @description Types for cross-asset lead-lag analysis and microstructure latency interception.
 */

export interface TickEvent {
  symbol: string;
  price: number;
  timestampMs: number;
}

export interface LeadLagConfig {
  /** Maximum discrete lag horizon in ticks, tau in [1, maxLag] */
  maxLag: number;
  /** Exponential decay factor for online variance/covariance in (0, 1) */
  decayFactor: number;
  /** Minimum observations required before emitting reliable lead-lag metrics */
  minObservations: number;
  /** Sensitivity scaling factor converting leader momentum to reservation price drift */
  sensitivityBps: number;
}

export interface PairLagMetrics {
  lag: number;
  correlation: number;
  covariance: number;
}

export interface GrangerScore {
  leadSymbol: string;
  followerSymbol: string;
  optimalLag: number;
  peakCorrelation: number;
  causalityScore: number;
  isLeading: boolean;
}

export interface CrossCorrelationState {
  symbols: string[];
  lastPrices: Record<string, number>;
  returnHistories: Record<string, number[]>;
  variances: Record<string, number>;
  observationCounts: Record<string, number>;
  lagCovariances: Record<string, Record<number, number>>;
}

export interface LeadLagInterceptResult {
  followerSymbol: string;
  leadingSymbol: string | null;
  optimalLag: number;
  leadershipConfidence: number;
  driftBps: number;
  recommendedReservationPrice: number;
  actionRequired: boolean;
}
