/**
 * @file toxicity-types.ts
 * @description Types for Microstructure Flow Toxicity and Hawkes point processes.
 */

export interface ContinuousVpinState {
  readonly currentBucketVolume: number;
  readonly absoluteImbalance: number;
  readonly bucketCount: number;
  readonly historicalVpins: readonly number[];
  readonly currentVpin: number;
  readonly thresholdCdf: number; // Probability toxicity is anomalous
}

export interface HawkesPointEvent {
  readonly timestampMs: number;
  readonly magnitude: number; // Order size or price impact
  readonly side: 'buy' | 'sell';
}

export interface HawkesProcessModel {
  readonly baselineIntensityMu: number;
  readonly jumpExcitationAlpha: number;
  readonly decayRateBeta: number;
}

export interface HawkesIntensityEstimate {
  readonly timestampMs: number;
  readonly currentIntensity: number;
  readonly backgroundProbability: number;
  readonly selfExcitedProbability: number;
  readonly isBursting: boolean;
}

export interface WhaleSweepSignal {
  readonly detected: boolean;
  readonly dominantSide: 'buy' | 'sell' | 'mixed';
  readonly severityScore: number; // [0, 1]
  readonly estimatedSweepSizeVol: number;
}
