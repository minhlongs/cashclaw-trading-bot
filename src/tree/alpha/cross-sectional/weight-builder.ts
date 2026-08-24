// Weight construction and config validation for the cross-sectional simulator.
// Pure, deterministic — no I/O, no network, no Node APIs.

import { selectLongShort } from '@/tree/alpha/universe/universe';
import type { RankedAsset } from '@/tree/alpha/universe/types';
import { resolveStressConfig } from '@/forest/backtest/cost-model';

import type { CrossSectionalSimConfig } from './types';

/** Per-unit-turnover cost fraction resolved from config. */
export function resolveCostFraction(config: CrossSectionalSimConfig): number {
  if (config.costBps !== undefined) {
    return config.costBps / 10_000;
  }
  const stress = resolveStressConfig(config.stressMode ?? 'conservative');
  return stress.feePct + stress.slipPct + stress.marketImpactPct;
}

/** Build signed weights for one snapshot's ranking (zero weights dropped). */
export function buildWeights(
  assets: readonly RankedAsset[],
  config: CrossSectionalSimConfig,
): Record<string, number> {
  const raw = config.weighter
    ? config.weighter(assets)
    : defaultLongShortWeights(assets, config.topN, config.bottomN);

  const weights: Record<string, number> = {};
  for (const symbol of Object.keys(raw)) {
    const w = raw[symbol];
    if (Number.isFinite(w) && w !== 0) {
      weights[symbol] = w;
    }
  }
  return weights;
}

/** Default: selectLongShort + equal weight per side. */
function defaultLongShortWeights(
  assets: readonly RankedAsset[],
  topN: number,
  bottomN: number,
): Record<string, number> {
  const selection = selectLongShort(assets, topN, bottomN);
  const weights: Record<string, number> = {};
  if (topN > 0) {
    for (const symbol of selection.long) weights[symbol] = 1 / topN;
  }
  if (bottomN > 0) {
    for (const symbol of selection.short) weights[symbol] = -1 / bottomN;
  }
  return weights;
}

/** Validate sim config; throws on any invalid field (fail-closed). */
export function validateConfig(config: CrossSectionalSimConfig): void {
  if (!Number.isInteger(config.topN) || config.topN < 0) {
    throw new Error('runCrossSectionalSim: topN must be a non-negative integer');
  }
  if (!Number.isInteger(config.bottomN) || config.bottomN < 0) {
    throw new Error('runCrossSectionalSim: bottomN must be a non-negative integer');
  }
  if (!Number.isInteger(config.minObservations) || config.minObservations < 1) {
    throw new Error('runCrossSectionalSim: minObservations must be a positive integer');
  }
  if (config.costBps !== undefined && (!Number.isFinite(config.costBps) || config.costBps < 0)) {
    throw new Error('runCrossSectionalSim: costBps must be a non-negative finite number');
  }
  if (!config.weighter && config.topN === 0 && config.bottomN === 0) {
    throw new Error('runCrossSectionalSim: topN and bottomN cannot both be 0 without a weighter');
  }
}
