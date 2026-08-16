// Alpha Lab — Signal Combiner
// Pure functions that merge multiple AlphaSignals into a single composite signal.

import type {
  AlphaSignal,
  AlphaCombinerConfig,
  AlphaDirection,
  FeatureVector,
} from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DIR_VAL: Record<AlphaDirection, number> = { buy: 1, sell: -1, hold: 0 };

function valToDir(v: number): AlphaDirection {
  if (v > 1e-9) return 'buy';
  if (v < -1e-9) return 'sell';
  return 'hold';
}

function weight(sig: AlphaSignal, cfg: AlphaCombinerConfig): number {
  return cfg.weights[sig.name] ?? sig.confidence;
}

function defaultFeatures(): FeatureVector {
  return { features: [], computedAt: Date.now(), symbol: '', lookback: 0 };
}

function buildResult(
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

// ── Strategy implementations ──────────────────────────────────────────────────

function combineWeightedSum(
  signals: AlphaSignal[],
  cfg: AlphaCombinerConfig,
): AlphaSignal | null {
  let weighted = 0;
  let total = 0;

  for (const s of signals) {
    const w = weight(s, cfg);
    weighted += w * DIR_VAL[s.direction];
    total += w;
  }

  if (total === 0) return null;

  const dir = valToDir(weighted);
  if (dir === 'hold') return null; // signals cancel out

  // Confidence is the raw weighted sum magnitude, capped at 1.
  const conf = Math.min(Math.abs(weighted), 1);
  if (conf < cfg.minConfidence) return null;

  return buildResult(signals, dir, conf, cfg, 'weighted_sum');
}

function combineVoting(
  signals: AlphaSignal[],
  cfg: AlphaCombinerConfig,
): AlphaSignal | null {
  const tally: Record<AlphaDirection, number> = { buy: 0, sell: 0, hold: 0 };

  for (const s of signals) {
    tally[s.direction] += weight(s, cfg);
  }

  const best = Math.max(tally.buy, tally.sell, tally.hold);
  const winners = (Object.keys(tally) as AlphaDirection[]).filter(
    (d) => tally[d] === best,
  );

  // Tie between two non-hold directions, or majority is hold → no trade
  if (winners.length > 1 || winners[0] === 'hold') return null;

  const dir = winners[0];
  const total = signals.reduce((sum, s) => sum + weight(s, cfg), 0);
  const conf = total > 0 ? best / total : 0;

  if (conf < cfg.minConfidence) return null;

  return buildResult(signals, dir, conf, cfg, 'voting');
}

function combineMaxConfidence(
  signals: AlphaSignal[],
  cfg: AlphaCombinerConfig,
): AlphaSignal | null {
  let best = signals[0];

  for (const s of signals) {
    if (s.confidence > best.confidence) best = s;
  }

  if (best.direction === 'hold' || best.confidence < cfg.minConfidence) return null;

  return buildResult([best], best.direction, best.confidence, cfg, 'max_confidence');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Combine multiple alpha signals into a single composite signal.
 * Returns null when signals conflict (no trade) or when input is empty.
 * Pure function — no side effects.
 */
export function combineSignals(
  signals: AlphaSignal[],
  cfg: AlphaCombinerConfig,
): AlphaSignal | null {
  if (signals.length === 0) return null;

  switch (cfg.method) {
    case 'weighted_sum':
      return combineWeightedSum(signals, cfg);
    case 'voting':
      return combineVoting(signals, cfg);
    case 'max_confidence':
      return combineMaxConfidence(signals, cfg);
    default:
      return null;
  }
}
