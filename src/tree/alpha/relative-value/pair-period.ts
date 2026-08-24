// Per-period helpers for the pair-spread simulator.
// Pure, deterministic — no I/O, no Math.random, no Date.now.

import { resolveStressConfig } from '@/tree/alpha/cost-stress';
import type { PairPanel, PairPositionState, PairSimConfig } from './types';
import { POSITION_FLAT, POSITION_LONG } from './entry-exit';

// ── Panel structure validation ───────────────────────────────────────────

/**
 * Assert every close in the panel is positive and finite.
 * Shared by validateStructure, buildSpreadSeries, and validatePairTradable.
 * @param prefix  calling module name for the error message prefix.
 */
export function assertPositiveCloses(panel: PairPanel, prefix: string): void {
  const n = panel.timestamps.length;
  for (let i = 0; i < n; i++) {
    const a = panel.closesA[i]!;
    const b = panel.closesB[i]!;
    if (!Number.isFinite(a) || a <= 0) {
      throw new Error(
        `${prefix}: legA close must be positive finite at index ${i}`,
      );
    }
    if (!Number.isFinite(b) || b <= 0) {
      throw new Error(
        `${prefix}: legB close must be positive finite at index ${i}`,
      );
    }
  }
}

export function validateStructure(panel: PairPanel, config: PairSimConfig): void {
  if (panel.timestamps.length === 0) {
    throw new Error('runPairSpreadSim: panel must be non-empty');
  }
  const n = panel.timestamps.length;
  if (n !== panel.closesA.length || n !== panel.closesB.length) {
    throw new Error('runPairSpreadSim: panel array lengths differ');
  }
  if (!Number.isInteger(config.minObservations) || config.minObservations < 1) {
    throw new Error('runPairSpreadSim: minObservations must be a positive integer');
  }
  if (n < config.minObservations) {
    throw new Error(
      `runPairSpreadSim: ${n} observations below minObservations ${config.minObservations}`,
    );
  }
  if (
    !Number.isInteger(config.revalidateEvery) ||
    config.revalidateEvery <= 0
  ) {
    throw new Error('runPairSpreadSim: revalidateEvery must be a positive integer');
  }
  assertPositiveCloses(panel, 'runPairSpreadSim');
  for (let i = 1; i < n; i++) {
    if (panel.timestamps[i]! <= panel.timestamps[i - 1]!) {
      throw new Error('runPairSpreadSim: timestamps must be strictly increasing');
    }
  }
}

// ── Per-leg simple returns ───────────────────────────────────────────────

/**
 * Derive per-leg simple returns from closes.
 * r(i) = close(i+1)/close(i) - 1, attributed to timestamp i (earned i→i+1).
 * Returns array of length n-1 (no return for the last timestamp).
 */
export function deriveReturns(closes: readonly number[]): number[] {
  const r: number[] = [];
  for (let i = 0; i < closes.length - 1; i++) {
    r.push(closes[i + 1]! / closes[i]! - 1);
  }
  return r;
}

// ── Weight builder ───────────────────────────────────────────────────────

/**
 * Build position weights at time t from position state + hedge ratio.
 * LONG_SPREAD:  wB = +1, wA = -β (long B, short β units of A).
 * SHORT_SPREAD: wB = -1, wA = +β (short B, long β units of A).
 * FLAT: empty weights.
 */
export function buildWeights(
  position: PairPositionState,
  legA: string,
  legB: string,
  hedgeRatio: number | null,
): Record<string, number> {
  if (position === POSITION_FLAT) return {};
  if (hedgeRatio === null) return {};
  const pos = position === POSITION_LONG ? 1 : -1;
  return { [legB]: pos, [legA]: -pos * hedgeRatio };
}

// ── Cost fraction resolver ───────────────────────────────────────────────

/**
 * Resolve the per-unit-turnover cost fraction from config.
 * costBps/10000 takes priority; otherwise resolveStressConfig sums.
 */
export function resolveCostFraction(config: Pick<PairSimConfig, 'costBps' | 'stressMode'>): number {
  if (config.costBps !== undefined) return config.costBps / 10_000;
  const stress = resolveStressConfig(config.stressMode ?? 'conservative');
  return stress.feePct + stress.slipPct + stress.marketImpactPct;
}

// ── Exposure helpers ─────────────────────────────────────────────────────

export function computeExposures(weights: Record<string, number>): { gross: number; net: number } {
  let grossExposure = 0;
  let netExposure = 0;
  for (const symbol of Object.keys(weights)) {
    grossExposure += Math.abs(weights[symbol]!);
    netExposure += weights[symbol]!;
  }
  return { gross: grossExposure, net: netExposure };
}

// ── Warmup boundary ──────────────────────────────────────────────────────

/**
 * Find the first spread-state index with a non-null zScore.
 * The simulation loop starts at this index (first valid decision time).
 */
export function findWarmupEnd(zScores: Array<number | null>): number {
  for (let i = 0; i < zScores.length; i++) {
    if (zScores[i] !== null) return i;
  }
  return zScores.length; // never entry → 0 trades
}
