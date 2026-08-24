// Beta-aware sizing for cross-sectional portfolios.
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Causality contract: estimateRollingBetas only consumes returns whose
// timestamp is STRICTLY BEFORE the sizing timestamp; the trailing `window`
// of those aligned observations feeds a single-factor OLS via
// computeFactorExposure. Estimation failures are fail-closed (null), never
// guessed (no silent beta = 1).

import { computeFactorExposure } from '@/tree/alpha/factors/analysis';
import { basketNeutralize } from '@/tree/alpha/universe/universe';
import type { AssetReturnSeries } from './types';

/** computeFactorExposure returns a degenerate 0 below 3 observations. */
const OLS_MIN_OBS = 3;
const DEFAULT_EPSILON = 1e-9;

/** Options for scaleWeightsToTargetBeta. */
export interface BetaScaleConfig {
  /** |βp| below this is treated as degenerate (default 1e-9). */
  readonly epsilon?: number;
  /**
   * When true, rescale after beta scaling so gross exposure equals the
   * input gross (this trades the exact beta target for constant gross).
   * Default false: scaling hits the exact target beta and gross moves by
   * |targetBeta / βp|.
   */
  readonly renormalize?: boolean;
}

/** Result of beta-aware scaling. */
export interface BetaScaleResult {
  readonly weights: Record<string, number>;
  /** true = scaled, 'neutralized' = targetBeta 0 path, false = fail-closed. */
  readonly betaApplied: boolean | 'neutralized';
  readonly fallbackReason?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`estimateRollingBetas: ${name} must be a positive integer`);
  }
}

function requireAlignedSeries(series: AssetReturnSeries): void {
  if (series.timestamps.length !== series.returns.length) {
    throw new Error(
      `estimateRollingBetas: ${series.symbol} timestamps/returns length mismatch`,
    );
  }
}

/** Trailing `window` (asset, benchmark) pairs with timestamp < sizingTime. */
function alignedPairs(
  series: AssetReturnSeries,
  benchmarkByTs: ReadonlyMap<number, number>,
  sizingTime: number,
  window: number,
): { asset: number[]; benchmark: number[] } {
  const asset: number[] = [];
  const benchmark: number[] = [];
  for (let i = 0; i < series.timestamps.length; i++) {
    const ts = series.timestamps[i]!;
    if (ts >= sizingTime) continue;
    const b = benchmarkByTs.get(ts);
    if (b === undefined) continue;
    asset.push(series.returns[i]!);
    benchmark.push(b);
  }
  const start = Math.max(0, asset.length - window);
  return { asset: asset.slice(start), benchmark: benchmark.slice(start) };
}

function variance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Rolling OLS beta of each asset vs the benchmark, using only returns with
 * timestamp STRICTLY BEFORE `sizingTime` (defaults to +∞ = whole history).
 * Returns null per asset when fewer than max(minObs, 3) aligned observations
 * exist or the benchmark variance in-window is 0. Never invents a beta.
 * @internal This function is public for testing; prefer the compose flow via evaluate.ts.
 */
export function estimateRollingBetas(
  assetReturns: readonly AssetReturnSeries[],
  benchmarkReturns: AssetReturnSeries,
  window: number,
  minObs: number,
  sizingTime: number = Number.POSITIVE_INFINITY,
): Record<string, number | null> {
  requirePositiveInteger(window, 'window');
  requirePositiveInteger(minObs, 'minObs');
  if (Number.isNaN(sizingTime)) {
    throw new Error('estimateRollingBetas: sizingTime must not be NaN');
  }
  requireAlignedSeries(benchmarkReturns);

  const benchmarkByTs = new Map<number, number>();
  for (let i = 0; i < benchmarkReturns.timestamps.length; i++) {
    const ts = benchmarkReturns.timestamps[i]!;
    if (ts < sizingTime) benchmarkByTs.set(ts, benchmarkReturns.returns[i]!);
  }

  const out: Record<string, number | null> = {};
  for (const series of assetReturns) {
    requireAlignedSeries(series);
    const pairs = alignedPairs(series, benchmarkByTs, sizingTime, window);
    if (pairs.asset.length < minObs || pairs.asset.length < OLS_MIN_OBS) {
      out[series.symbol] = null;
      continue;
    }
    if (variance(pairs.benchmark) === 0) {
      out[series.symbol] = null;
      continue;
    }
    out[series.symbol] = computeFactorExposure(
      pairs.asset,
      pairs.benchmark,
      'benchmark',
    ).exposure;
  }
  return out;
}

/**
 * Scale weights to a target portfolio beta βp = Σ w_i·β_i.
 * - targetBeta === 0: neutralize via basketNeutralize (division by βp is
 *   degenerate at zero); betaApplied = 'neutralized'.
 * - targetBeta ≠ 0: fail-closed (input weights unchanged, betaApplied false)
 *   when any held asset has a null/missing beta or |βp| < epsilon. Otherwise
 *   w_i ← w_i × (targetBeta / βp).
 */
export function scaleWeightsToTargetBeta(
  weights: Readonly<Record<string, number>>,
  betas: Readonly<Record<string, number | null>>,
  targetBeta: number,
  config: BetaScaleConfig = {},
): BetaScaleResult {
  if (Number.isNaN(targetBeta)) {
    throw new Error('scaleWeightsToTargetBeta: targetBeta must not be NaN');
  }
  if (targetBeta === 0) {
    return { weights: basketNeutralize({ ...weights }), betaApplied: 'neutralized' };
  }

  const held = Object.entries(weights).filter(([, w]) => w !== 0);
  if (held.length === 0) {
    return {
      weights: { ...weights },
      betaApplied: false,
      fallbackReason: 'no held positions to size',
    };
  }

  const resolved: Array<{ symbol: string; weight: number; beta: number }> = [];
  for (const [symbol, weight] of held) {
    const beta = betas[symbol];
    if (beta === null || beta === undefined) {
      return {
        weights: { ...weights },
        betaApplied: false,
        fallbackReason: `missing beta estimate for held asset ${symbol}`,
      };
    }
    resolved.push({ symbol, weight, beta });
  }

  const portfolioBeta = resolved.reduce((s, r) => s + r.weight * r.beta, 0);
  const epsilon = config.epsilon ?? DEFAULT_EPSILON;
  if (Math.abs(portfolioBeta) < epsilon) {
    return {
      weights: { ...weights },
      betaApplied: false,
      fallbackReason: `portfolio beta ${portfolioBeta} within epsilon of zero`,
    };
  }

  const scale = targetBeta / portfolioBeta;
  let grossIn = 0;
  const scaled: Record<string, number> = {};
  for (const [symbol, w] of Object.entries(weights)) {
    grossIn += Math.abs(w);
    scaled[symbol] = w * scale;
  }
  if (config.renormalize === true && grossIn > 0) {
    const grossOut = Object.values(scaled).reduce((s, w) => s + Math.abs(w), 0);
    const fix = grossIn / grossOut;
    for (const symbol of Object.keys(scaled)) scaled[symbol]! *= fix;
  }
  return { weights: scaled, betaApplied: true };
}
