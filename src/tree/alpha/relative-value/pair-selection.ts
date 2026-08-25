// Causal pair selection inside a training window.
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Causality contract: selectPairs consumes ONLY rows with timestamp
// STRICTLY BEFORE `asOfTime` (the current window's trainEnd). Mutating rows
// at or after that boundary leaves the selection identical (leakage-tested).
//
// Pipeline: exhaustive C(n,2) over the universe → |Pearson| floor →
// (cointegration + half-life gate unless distance-mode) → frozen β estimate
// → stability rank → topK. Uses only existing primitives.

import { pearsonCorrelation, computeSpreadStatistics } from '../correlation/compute';
import { testCointegration } from '../correlation/adf';
import type { IndicatorCandle } from '../indicator-types';
import { estimateRollingHedgeRatio } from './hedge-ratio';
import { validatePairTradable, type TradabilityGateConfig } from './validation';
import { computePairStability, type PairStabilityConfig } from './stability';
import type { PairPanel } from './types';
import { assertPositiveCloses } from './pair-period';

/** Aligned multi-symbol close panel (shared timestamps across symbols). */
export interface UniversePanel {
  readonly symbols: readonly string[];
  readonly timestamps: readonly number[];
  /** closes[symbolIndex][barIndex]; every row equal length to timestamps. */
  readonly closes: readonly (readonly number[])[];
}

/** Selection config: gate fields + ranking knobs. */
export interface PairSelectionConfig extends TradabilityGateConfig {
  /** Hedge-ratio window for the frozen β estimate. */
  readonly hedgeWindow: number;
  /** Maximum pairs to return (ranked). */
  readonly topK: number;
  /** Distance-mode (M1): corr floor + minObs only; skip cointegration gate. */
  readonly distanceMode?: boolean;
  /** Stability config; when set, pairs are ranked by stability score. */
  readonly stability?: PairStabilityConfig;
}

/** Selection-time diagnostics for one candidate pair. */
export interface PairSelectionDiagnostics {
  readonly correlation: number;
  readonly cointegrated: boolean;
  readonly pValue: number;
  readonly halfLife: number | null;
  readonly observationCount: number;
}

/** One selected pair with its frozen β and ranking inputs. */
export interface SelectedPair {
  readonly legA: string;
  readonly legB: string;
  readonly betaFrozen: number;
  readonly stability: number;
  readonly diagnostics: PairSelectionDiagnostics;
}

function candles(timestamps: readonly number[], closes: readonly number[]): IndicatorCandle[] {
  return timestamps.map((t, i) => ({
    timestamp: t, open: closes[i]!, high: closes[i]!, low: closes[i]!, close: closes[i]!, volume: 0,
  }));
}

function assertUniverse(universe: UniversePanel): void {
  if (universe.symbols.length !== universe.closes.length) {
    throw new Error('selectPairs: symbols.length !== closes.length');
  }
  for (let s = 0; s < universe.closes.length; s++) {
    if (universe.closes[s]!.length !== universe.timestamps.length) {
      throw new Error(`selectPairs: closes[${s}] length differs from timestamps`);
    }
  }
  for (let i = 1; i < universe.timestamps.length; i++) {
    if (universe.timestamps[i]! <= universe.timestamps[i - 1]!) {
      throw new Error('selectPairs: timestamps must be strictly increasing');
    }
  }
}

/** PairPanel view of two universe rows (reuses pair-level primitives). */
function pairPanel(universe: UniversePanel, i: number, j: number): PairPanel {
  return {
    legA: universe.symbols[i]!,
    legB: universe.symbols[j]!,
    timestamps: universe.timestamps,
    closesA: universe.closes[i]!,
    closesB: universe.closes[j]!,
  };
}

function diagnosticsFor(
  ts: readonly number[],
  a: readonly number[],
  b: readonly number[],
): PairSelectionDiagnostics {
  const candlesA = candles(ts, a);
  const candlesB = candles(ts, b);
  const { cointegrated, pValue } = testCointegration(candlesA, candlesB);
  const stats = computeSpreadStatistics(candlesA, candlesB, ts.length);
  return {
    correlation: pearsonCorrelation([...a], [...b]),
    cointegrated,
    pValue,
    halfLife: Number.isFinite(stats.halfLife) ? stats.halfLife : null,
    observationCount: ts.length,
  };
}

/**
 * Select and rank candidate pairs using ONLY rows with timestamp strictly
 * before `asOfTime`. Fail-closed: fewer than 2 symbols or malformed panels
 * throw; a too-short causal slice returns [] (nothing selectable).
 */
export function selectPairs(
  universe: UniversePanel,
  asOfTime: number,
  config: PairSelectionConfig,
): SelectedPair[] {
  assertUniverse(universe);
  if (universe.symbols.length < 2) {
    throw new Error('selectPairs: universe must contain at least 2 symbols');
  }
  if (!Number.isInteger(config.topK) || config.topK <= 0) {
    throw new Error('selectPairs: topK must be a positive integer');
  }
  if (Number.isNaN(asOfTime)) {
    throw new Error('selectPairs: asOfTime must not be NaN');
  }

  // Causal slice: indices strictly before asOfTime.
  let sliceEnd = 0;
  while (sliceEnd < universe.timestamps.length && universe.timestamps[sliceEnd]! < asOfTime) {
    sliceEnd++;
  }
  const required = Math.max(config.minObs, 10);
  if (sliceEnd < required) return [];

  const ts = universe.timestamps.slice(0, sliceEnd);
  const selected: SelectedPair[] = [];
  for (let i = 0; i < universe.symbols.length; i++) {
    for (let j = i + 1; j < universe.symbols.length; j++) {
      const panel = pairPanel(universe, i, j);
      assertPositiveCloses(
        { ...panel, timestamps: ts, closesA: panel.closesA.slice(0, sliceEnd), closesB: panel.closesB.slice(0, sliceEnd) },
        'selectPairs',
      );
      const a = panel.closesA.slice(0, sliceEnd);
      const b = panel.closesB.slice(0, sliceEnd);
      const diagnostics = diagnosticsFor(ts, a, b);
      if (Math.abs(diagnostics.correlation) < config.minCorrelation) continue;
      if (!config.distanceMode) {
        const verdict = validatePairTradable(panel, config, asOfTime);
        if (!verdict.tradable) continue;
      }
      const beta = estimateRollingHedgeRatio(panel, config.hedgeWindow, config.minObs, asOfTime);
      if (beta.hedgeRatio === null) continue;
      const stability = config.stability
        ? computePairStability(panel, config.stability, asOfTime).score
        : 0;
      selected.push({
        legA: panel.legA,
        legB: panel.legB,
        betaFrozen: beta.hedgeRatio,
        stability,
        diagnostics,
      });
    }
  }

  selected.sort(
    (x, y) =>
      y.stability - x.stability ||
      Math.abs(y.diagnostics.correlation) - Math.abs(x.diagnostics.correlation) ||
      `${x.legA}/${x.legB}`.localeCompare(`${y.legA}/${y.legB}`),
  );
  return selected.slice(0, config.topK);
}
