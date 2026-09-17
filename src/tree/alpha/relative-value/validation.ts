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

import { testCointegration } from '../correlation/adf';
import { computeSpreadStatistics, pearsonCorrelation } from '../correlation/compute';
import type { PairPanel } from './types';
import {
  assertInputs,
  causalSlice,
  failedReasons,
  OBSERVATION_FLOOR,
  toCandles,
  type PairValidationDiagnostics,
  type PairValidationResult,
  type TradabilityGateConfig,
} from './validation-helpers';

export type { TradabilityGateConfig, PairValidationDiagnostics, PairValidationResult } from './validation-helpers';
// Re-exported for consumer compatibility; values/types live in validation-helpers.
export { VALIDATION_REASONS } from './validation-helpers';

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
