// Attribution helpers for cross-sectional evaluation (plan §3 Step C).
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Two attribution strategies for long/short PnL split:
//
// 1. PRECISE (preferred): caller supplies per-asset return series for each
//    period via `assetPeriodReturns: Array<Record<symbol, return>>`. Each
//    period's gross PnL is Σ w_i · r_i; the sum over i with w_i>0 goes to
//    longSidePnl, w_i<0 to shortSidePnl. Exact by construction.
// 2. PROPORTIONAL (fallback): when per-asset returns are unavailable,
//    split each period's grossReturn in proportion to that period's long
//    vs short gross exposure. If one side has zero exposure, the full
//    grossReturn goes to the other side. This preserves the invariant
//    (longSidePnl + shortSidePnl === gross PnL) by construction.
//
// Cost attribution decomposes Σ costPct into fee/slippage/impact shares
// using the same proportion as the chosen StressMode config.

import type { RebalanceRecord } from '@/tree/alpha/cross-sectional/types';
import { resolveStressConfig, type StressMode } from '@/forest/backtest/cost-model';

/** Input for precise long/short attribution. */
export interface PreciseAttributionInput {
  /** Weights for the period (symbol → weight). */
  readonly weights: Record<string, number>;
  /** Per-asset returns for the period (symbol → return). */
  readonly assetReturns: Record<string, number>;
}

/** Result of long/short attribution. */
export interface LongShortAttributionResult {
  readonly longSidePnl: number;
  readonly shortSidePnl: number;
}

/** Result of cost attribution. */
export interface CostAttributionResult {
  readonly fees: number;
  readonly slippage: number;
  readonly marketImpact: number;
}

/**
 * Precise long/short attribution using per-asset returns.
 * Requires that every held symbol in weights has an entry in assetReturns.
 * Throws if a held symbol's return is missing (fail-closed).
 */
export function attributeLongShortPrecise(
  inputs: readonly PreciseAttributionInput[],
): LongShortAttributionResult {
  let longSum = 0;
  let shortSum = 0;
  for (const { weights, assetReturns } of inputs) {
    for (const [symbol, weight] of Object.entries(weights)) {
      const r = assetReturns[symbol];
      if (r === undefined) {
        throw new Error(
          `attributeLongShortPrecise: missing return for held symbol '${symbol}'`,
        );
      }
      const contrib = weight * r;
      if (weight > 0) longSum += contrib;
      else if (weight < 0) shortSum += contrib;
      // weight === 0 already filtered by simulator
    }
  }
  return { longSidePnl: longSum, shortSidePnl: shortSum };
}

/**
 * Proportional long/short attribution fallback.
 * Splits each period's grossReturn by long vs short gross exposure share.
 * If one side has zero gross exposure, the full grossReturn goes to the
 * other side. Preserves: longSidePnl + shortSidePnl === Σ grossReturn.
 */
export function attributeLongShortProportional(
  periods: readonly RebalanceRecord[],
): LongShortAttributionResult {
  let longSum = 0;
  let shortSum = 0;
  for (const p of periods) {
    let longGross = 0;
    let shortGross = 0;
    for (const w of Object.values(p.weights)) {
      if (w > 0) longGross += w;
      else if (w < 0) shortGross += -w; // absolute short exposure
    }
    const totalGross = longGross + shortGross;
    if (totalGross === 0) continue; // no exposure, no contribution
    const longShare = longGross / totalGross;
    const shortShare = shortGross / totalGross;
    longSum += p.grossReturn * longShare;
    shortSum += p.grossReturn * shortShare;
  }
  return { longSidePnl: longSum, shortSidePnl: shortSum };
}

/**
 * Cost attribution: decompose total per-period costPct into fee/slippage/impact
 * using the proportions from resolveStressConfig(mode).
 * If costBps was explicitly set in the simulator config, we CANNOT decompose
 * without the original fee/slip/impact values. In that case this function
 * returns zeros and the caller must provide the breakdown via a dedicated
 * CostConfig. We use mode='conservative' as default (matches simulator).
 */
export function attributeCosts(
  periods: readonly RebalanceRecord[],
  mode: StressMode = 'conservative',
): CostAttributionResult {
  const stress = resolveStressConfig(mode);
  const totalUnitCost = stress.feePct + stress.slipPct + stress.marketImpactPct;
  if (totalUnitCost === 0) {
    return { fees: 0, slippage: 0, marketImpact: 0 };
  }

  const feeShare = stress.feePct / totalUnitCost;
  const slipShare = stress.slipPct / totalUnitCost;
  const impactShare = stress.marketImpactPct / totalUnitCost;

  let fees = 0;
  let slippage = 0;
  let marketImpact = 0;
  for (const p of periods) {
    fees += p.costPct * feeShare;
    slippage += p.costPct * slipShare;
    marketImpact += p.costPct * impactShare;
  }
  return { fees, slippage, marketImpact };
}