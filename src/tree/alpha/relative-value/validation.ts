// Fail-closed tradability validation gate for pair spreads.
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Causality contract: the verdict at `asOfTime` consumes only panel entries
// whose timestamp is STRICTLY BEFORE `asOfTime`, truncated to the trailing
// `validationWindow`. Trading may only begin at a moment whose gate ran on
// strictly earlier data — the gate itself is causal.
//
// Conjunctive gate (ALL must hold): sufficient aligned observations
// (>= max(minObs, 10)), cointegrated (p < 0.05 baked into testCointegration),
// finite half-life <= maxHalfLife, and |Pearson correlation| >= minCorrelation.
// ANY failure => tradable:false with EVERY failed reason listed — the gate
// never "passes with warning", never stops at the first failure.
//
// Non-finite half-life NEVER leaves this module: computeSpreadStatistics emits
// Infinity when the OLS finds no mean reversion (phi outside (0,1)) or the
// slice is too short; diagnostics serialize that as null so reports stay
// JSON-safe and no downstream consumer can mistake Infinity for a value.

import type { IndicatorCandle } from '../indicator-types';
import { testCointegration } from '../correlation/adf';
import { computeSpreadStatistics, pearsonCorrelation } from '../correlation/compute';
import type { PairPanel, PairSimConfig } from './types';
import { assertPositiveCloses } from './pair-period';

/** Absolute floor on aligned observations regardless of config.minObs. */
const OBSERVATION_FLOOR = 10;

/** Distinct fail-closed reasons (tested verbatim). */
export const VALIDATION_REASONS = {
  insufficientObservations: 'insufficient observations for tradability gate',
  notCointegrated: 'pair is not cointegrated (pValue >= 0.05)',
  halfLifeNonFinite: 'half-life is non-finite (no mean-reversion evidence)',
  halfLifeTooLong: 'half-life exceeds maxHalfLife',
  correlationBelowFloor: '|correlation| below minCorrelation floor',
} as const;

/** Config subset consumed by the gate (a full PairSimConfig is assignable). */
export type TradabilityGateConfig = Pick<
  PairSimConfig,
  'validationWindow' | 'minObs' | 'maxHalfLife' | 'minCorrelation'
>;

/** Measurements taken on the pre-asOf slice. Always populated, even on failure. */
export interface PairValidationDiagnostics {
  /** Pearson correlation of the two close slices. */
  readonly correlation: number;
  /** Whether the simplified Engle-Granger test accepted cointegration. */
  readonly cointegrated: boolean;
  /** Approximate ADF p-value (accept threshold 0.05 inside testCointegration). */
  readonly pValue: number;
  /** Mean-reversion half-life in periods; null when non-finite (never Infinity). */
  readonly halfLife: number | null;
  /** Aligned entries in the pre-asOf slice actually used. */
  readonly observationCount: number;
}

/** Gate verdict with its diagnostics. */
export interface PairValidationResult {
  readonly tradable: boolean;
  /** Every failed condition; empty iff tradable. */
  readonly reasons: readonly string[];
  readonly diagnostics: PairValidationDiagnostics;
}

/** Trailing `window` aligned entries with timestamp STRICTLY < asOfTime. */
function causalSlice(
  panel: PairPanel,
  window: number,
  asOfTime: number,
): { timestamps: number[]; a: number[]; b: number[] } {
  const timestamps: number[] = [];
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < panel.timestamps.length; i++) {
    if (panel.timestamps[i]! >= asOfTime) continue;
    timestamps.push(panel.timestamps[i]!);
    a.push(panel.closesA[i]!);
    b.push(panel.closesB[i]!);
  }
  const start = Math.max(0, a.length - window);
  return { timestamps: timestamps.slice(start), a: a.slice(start), b: b.slice(start) };
}

/** Minimal OHLCV stub: timestamp/close real, ohlc = close, volume = 0. */
function toCandles(timestamps: readonly number[], closes: readonly number[]): IndicatorCandle[] {
  const out: IndicatorCandle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i]!;
    out.push({
      timestamp: timestamps[i]!,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    });
  }
  return out;
}

/** Collect EVERY failed gate condition (conjunction evaluated in full). */
function failedReasons(
  requiredObs: number,
  diagnostics: PairValidationDiagnostics,
  maxHalfLife: number,
  minCorrelation: number,
): string[] {
  const reasons: string[] = [];
  if (diagnostics.observationCount < requiredObs) {
    reasons.push(VALIDATION_REASONS.insufficientObservations);
  }
  if (!diagnostics.cointegrated) {
    reasons.push(VALIDATION_REASONS.notCointegrated);
  }
  if (diagnostics.halfLife === null) {
    reasons.push(VALIDATION_REASONS.halfLifeNonFinite);
  } else if (diagnostics.halfLife > maxHalfLife) {
    reasons.push(VALIDATION_REASONS.halfLifeTooLong);
  }
  if (Math.abs(diagnostics.correlation) < minCorrelation) {
    reasons.push(VALIDATION_REASONS.correlationBelowFloor);
  }
  return reasons;
}

function assertInputs(panel: PairPanel, config: TradabilityGateConfig, asOfTime: number): void {
  if (
    panel.timestamps.length !== panel.closesA.length ||
    panel.timestamps.length !== panel.closesB.length
  ) {
    throw new Error('validatePairTradable: panel array lengths differ');
  }
  assertPositiveCloses(panel, 'validatePairTradable');
  if (!Number.isInteger(config.validationWindow) || config.validationWindow <= 0) {
    throw new Error('validatePairTradable: validationWindow must be a positive integer');
  }
  if (!Number.isInteger(config.minObs) || config.minObs <= 0) {
    throw new Error('validatePairTradable: minObs must be a positive integer');
  }
  if (!Number.isFinite(config.maxHalfLife) || config.maxHalfLife <= 0) {
    throw new Error('validatePairTradable: maxHalfLife must be a positive finite number');
  }
  if (!Number.isFinite(config.minCorrelation) || config.minCorrelation < 0 || config.minCorrelation > 1) {
    throw new Error('validatePairTradable: minCorrelation must be within [0, 1]');
  }
  if (Number.isNaN(asOfTime)) {
    throw new Error('validatePairTradable: asOfTime must not be NaN');
  }
}

/**
 * Statistically validate that a pair is tradable as of `asOfTime`, using only
 * panel entries with timestamp STRICTLY BEFORE `asOfTime` (trailing
 * `validationWindow`). Runs the real primitives — testCointegration,
 * computeSpreadStatistics (same OLS residual convention as the spread, B on
 * A), pearsonCorrelation — over the identical pre-asOf slice, then applies the
 * conjunctive gate. Fails closed: any insufficient/degenerate input yields
 * `tradable:false` plus the full list of failed reasons.
 */
export function validatePairTradable(
  panel: PairPanel,
  config: TradabilityGateConfig,
  asOfTime: number,
): PairValidationResult {
  assertInputs(panel, config, asOfTime);
  const slice = causalSlice(panel, config.validationWindow, asOfTime);
  const observationCount = Math.min(slice.a.length, slice.b.length);
  const candlesA = toCandles(slice.timestamps, slice.a);
  const candlesB = toCandles(slice.timestamps, slice.b);

  const { cointegrated, pValue } = testCointegration(candlesA, candlesB);
  const stats = computeSpreadStatistics(candlesA, candlesB, observationCount);
  const correlation = pearsonCorrelation(slice.a, slice.b);

  // Serialize a non-finite half-life as null INSIDE this module: Infinity
  // means "no measurable mean reversion", which must read as absence of a
  // value downstream, never as a giant-but-usable number.
  const halfLife = Number.isFinite(stats.halfLife) ? stats.halfLife : null;

  const diagnostics: PairValidationDiagnostics = {
    correlation,
    cointegrated,
    pValue,
    halfLife,
    observationCount,
  };
  const reasons = failedReasons(
    Math.max(config.minObs, OBSERVATION_FLOOR),
    diagnostics,
    config.maxHalfLife,
    config.minCorrelation,
  );
  return { tradable: reasons.length === 0, reasons, diagnostics };
}
