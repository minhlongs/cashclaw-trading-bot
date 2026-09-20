// Alpha Lab — Signal Combiner helpers.
// Pure helper functions and direction mappings used by combiner strategies.

import type {
  AlphaSignal,
  AlphaCombinerConfig,
  AlphaDirection,
  FeatureVector,
} from './types';

export const DIR_VAL: Record<AlphaDirection, number> = { buy: 1, sell: -1, hold: 0 };

export function valToDir(v: number): AlphaDirection {
  if (v > 1e-9) return 'buy';
  if (v < -1e-9) return 'sell';
  return 'hold';
}

export function weight(sig: AlphaSignal, cfg: AlphaCombinerConfig): number {
  return cfg.weights[sig.name] ?? sig.confidence;
}

export function defaultFeatures(): FeatureVector {
  return { features: [], computedAt: Date.now(), symbol: '', lookback: 0 };
}

export function buildResult(
  contributing: AlphaSignal[],
  direction: AlphaDirection,
  confidence: number,
  cfg: AlphaCombinerConfig,
  method: string,
): AlphaSignal {
  return {
    name: `combiner:${method}`,
    source: 'combiner',
    direction,
    confidence,
    timestamp: Date.now(),
    features: contributing[0]?.features ?? defaultFeatures(),
    metadata: {
      method,
      contributingNames: contributing.map((s) => s.name),
      combinerConfig: { method: cfg.method, weights: cfg.weights },
    },
  };
}
