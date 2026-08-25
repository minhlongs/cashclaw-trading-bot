// Assemble the full SurvivalEvaluationInput from relative-value results.
// ADAPTER, NOT ENGINE: wires existing primitives only — extractRoundTrips
// for trade returns, runBaseline('random_entry') for the baseline report.
// The caller supplies configMatrix (Step 9 robustness grid) and
// crossAssetReports (per-asset arm reports). Pure and deterministic — the
// random_entry baseline is internally seeded (42).

import type { Candle } from '@/forest/backtest/ohlcv';
import { runBaseline } from '@/forest/alpha/baselines';
import type {
  BootstrapOptions,
  CrossAssetConsistencyOptions,
  PermutationOptions,
  SurvivalEvaluationInput,
  WalkForwardConsistencyOptions,
} from '@/forest/alpha/multiple-testing/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { PairPeriodRecord } from '@/tree/alpha/relative-value';
import { extractRoundTrips } from './round-trips';
import { toEvaluationReport, type RVAdapterOptions } from './survival-adapter';
import { toWalkForwardShim } from './survival-shim';
import type { RVWalkForwardResult } from './walk-forward';

/** Assembly options: adapter identity, statistical thresholds and seeds. */
export interface SurvivalAssemblyConfig {
  /** Identity + metric options for the strategy report mapping. */
  readonly adapterOptions: RVAdapterOptions;
  readonly bootstrap: BootstrapOptions;
  readonly permutation: PermutationOptions;
  readonly walkForwardOptions: WalkForwardConsistencyOptions;
  readonly crossAssetOptions: CrossAssetConsistencyOptions;
  /** PBO proxy ceiling (protocol: 0.50). */
  readonly maxPbo: number;
}

/**
 * Entry-signal series aligned with `strategyReturns`: 1 when the period's
 * decision held a position, else 0. The permutation test shuffles this
 * series to break the return<->signal alignment.
 */
function entrySignals(periods: readonly PairPeriodRecord[]): number[] {
  return periods.map((p) => (p.position === 'flat' ? 0 : 1));
}

/**
 * Build the random-entry baseline report over candles covering the IDENTICAL
 * stitched OOS span (Step 8 benchmark wiring supplies the slices).
 */
function randomEntryBaseline(
  candles: readonly Candle[],
  options: RVAdapterOptions,
): EvaluationReport {
  const stressMode = options.stressMode ?? 'conservative';
  return runBaseline([...candles], {
    strategy: 'random_entry',
    symbol: options.symbol,
    timeframe: options.timeframe,
    stressMode,
    feePct: 0.0008,
    slipPct: 0.0003,
  });
}

/** Fail-closed guard: every statistical check needs ≥2 samples. */
function assertSufficientOos(
  oosPeriods: readonly PairPeriodRecord[],
  tradeReturns: readonly number[],
): void {
  if (oosPeriods.length < 2) {
    throw new Error(
      `assembleSurvivalInput: at least 2 OOS periods required, got ${oosPeriods.length}`,
    );
  }
  if (tradeReturns.length < 2) {
    throw new Error(
      `assembleSurvivalInput: at least 2 completed trades required for bootstrap, got ${tradeReturns.length}`,
    );
  }
}

/**
 * Assemble the complete SurvivalEvaluationInput consumed by
 * evaluateSurvival(). Fails closed when OOS output is too thin for any of
 * the statistical checks.
 */
export function assembleSurvivalInput(
  rv: RVWalkForwardResult,
  candles: readonly Candle[],
  configMatrix: readonly (readonly number[])[],
  crossAssetReports: readonly EvaluationReport[],
  assembly: SurvivalAssemblyConfig,
): SurvivalEvaluationInput {
  const oosPeriods = rv.stitched.roundTripsSource;
  const { roundTrips } = extractRoundTrips(oosPeriods);
  assertSufficientOos(oosPeriods, roundTrips.map((t) => t.netReturn));

  return {
    // Per-trade net returns feed the bootstrap CI; per-period net returns +
    // signals feed the permutation test (alignment needs every period).
    tradeReturns: roundTrips.map((t) => t.netReturn),
    strategyReturns: rv.stitched.netReturns,
    entrySignals: entrySignals(oosPeriods),
    walkForward: toWalkForwardShim(rv),
    configMatrix,
    crossAssetReports,
    baselineReport: randomEntryBaseline(candles, assembly.adapterOptions),
    report: toEvaluationReport(oosPeriods, assembly.adapterOptions),
    bootstrap: assembly.bootstrap,
    permutation: assembly.permutation,
    walkForwardOptions: assembly.walkForwardOptions,
    crossAssetOptions: assembly.crossAssetOptions,
    maxPbo: assembly.maxPbo,
  };
}
