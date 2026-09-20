// Alpha Lab — Signal Combiner strategies.
// Weighted-sum, voting, and max-confidence combination strategies.

import type { AlphaSignal, AlphaCombinerConfig, AlphaDirection } from './types';
import { DIR_VAL, valToDir, weight, buildResult } from './combiner-helpers';

export function combineWeightedSum(
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

export function combineVoting(
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

  // Tie between two non-hold directions, or majority is hold -> no trade
  if (winners.length > 1 || winners[0] === 'hold') return null;

  const dir = winners[0];
  const total = signals.reduce((sum, s) => sum + weight(s, cfg), 0);
  const conf = total > 0 ? best / total : 0;

  if (conf < cfg.minConfidence) return null;

  return buildResult(signals, dir, conf, cfg, 'voting');
}

export function combineMaxConfidence(
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
