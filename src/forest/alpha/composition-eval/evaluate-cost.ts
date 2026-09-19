// Cost fraction resolution for composition evaluation.

import type { CompositionEvalConfig } from './types';
import { resolveStressConfig } from '@/tree/alpha/cost-stress';

/**
 * Resolve cost fraction for one period from config.
 * costBps/10_000 takes priority; falls back to sum of stress components.
 */
export function resolveCostFraction(config: CompositionEvalConfig): number {
  if (config.costBps !== undefined) {
    return config.costBps / 10_000;
  }
  const stress = resolveStressConfig(config.stressMode ?? 'conservative');
  return stress.feePct + stress.slipPct + stress.marketImpactPct;
}
