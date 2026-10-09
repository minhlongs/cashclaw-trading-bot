import { resolveStressConfig } from '@/tree/alpha/cost-stress';
import type { PairPositionState, PairSimConfig } from './types';
import { POSITION_FLAT, POSITION_LONG } from './entry-exit';

export function deriveReturns(closes: readonly number[]): number[] {
  const r: number[] = [];
  for (let i = 0; i < closes.length - 1; i++) {
    r.push(closes[i + 1]! / closes[i]! - 1);
  }
  return r;
}

export function buildWeights(
  position: PairPositionState, legA: string, legB: string, hedgeRatio: number | null,
): Record<string, number> {
  if (position === POSITION_FLAT || hedgeRatio === null) return {};
  const pos = position === POSITION_LONG ? 1 : -1;
  return { [legB]: pos, [legA]: -pos * hedgeRatio };
}

export function resolveCostFraction(config: Pick<PairSimConfig, 'costBps' | 'stressMode'>): number {
  if (config.costBps !== undefined) return config.costBps / 10_000;
  const stress = resolveStressConfig(config.stressMode ?? 'conservative');
  return stress.feePct + stress.slipPct + stress.marketImpactPct;
}

export function computeExposures(weights: Record<string, number>): { gross: number; net: number } {
  let grossExposure = 0, netExposure = 0;
  for (const symbol of Object.keys(weights)) {
    grossExposure += Math.abs(weights[symbol]!);
    netExposure += weights[symbol]!;
  }
  return { gross: grossExposure, net: netExposure };
}

export function findWarmupEnd(zScores: Array<number | null>): number {
  for (let i = 0; i < zScores.length; i++) {
    if (zScores[i] !== null) return i;
  }
  return zScores.length;
}
