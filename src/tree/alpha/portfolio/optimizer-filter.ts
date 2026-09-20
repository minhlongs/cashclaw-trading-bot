// Portfolio Optimizer — Filter & Router
// Filters qualified signals and routes to allocation methods.

import type { AlphaSignal } from '../types';
import type { Allocation, OptimizerMethod } from './types';
import {
  equalWeight,
  confidenceWeighted,
  riskParity,
  regimeSized,
} from './optimizer-methods';

export type HandlerFn = (q: AlphaSignal[]) => Allocation[];

export function filterQualified(
  signals: AlphaSignal[],
  minConfidence: number,
  maxPositions: number,
): AlphaSignal[] {
  const nonHold = signals.filter((s) => s.direction !== 'hold');
  return nonHold
    .filter((s) => s.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxPositions);
}

export const HANDLERS: Record<OptimizerMethod, HandlerFn> = {
  equal_weight: equalWeight,
  confidence_weighted: confidenceWeighted,
  risk_parity: riskParity,
  regime_sized: regimeSized,
};
