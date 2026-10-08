// Statistical Arbitrage Dynamic Signal Generator
import type { StatArbSignalResult, StatArbAction } from './statarb-types';

export interface StatArbThresholds {
  readonly entryZScore: number; // e.g. 2.0
  readonly exitZScore: number; // e.g. 0.5
  readonly stopLossZScore?: number; // e.g. 3.5
}

export const DEFAULT_STATARB_THRESHOLDS: StatArbThresholds = {
  entryZScore: 2.0,
  exitZScore: 0.5,
  stopLossZScore: 3.5,
};

export function generateStatArbSignal(
  spread: number,
  mu: number,
  std: number,
  currentHedgeRatio: number,
  thresholds: StatArbThresholds = DEFAULT_STATARB_THRESHOLDS,
): StatArbSignalResult {
  if (std <= 1e-9) {
    return {
      action: 'HOLD',
      zScore: 0,
      spread,
      hedgeRatio: currentHedgeRatio,
      reason: 'Spread volatility is negligible, holding neutral',
    };
  }

  const zScore = (spread - mu) / std;
  let action: StatArbAction = 'HOLD';
  let reason = 'Z-Score within normal equilibrium band';

  if (thresholds.stopLossZScore && Math.abs(zScore) >= thresholds.stopLossZScore) {
    action = 'EXIT_SPREAD';
    reason = `Z-Score (${zScore.toFixed(2)}) breached stop-loss threshold (${thresholds.stopLossZScore})`;
  } else if (zScore >= thresholds.entryZScore) {
    action = 'ENTER_SHORT_SPREAD'; // Spread is too high, short y / long x
    reason = `Spread overextended positive (+${zScore.toFixed(2)} sigma)`;
  } else if (zScore <= -thresholds.entryZScore) {
    action = 'ENTER_LONG_SPREAD'; // Spread is too low, long y / short x
    reason = `Spread overextended negative (${zScore.toFixed(2)} sigma)`;
  } else if (Math.abs(zScore) <= thresholds.exitZScore) {
    action = 'EXIT_SPREAD';
    reason = `Spread converged to equilibrium (${zScore.toFixed(2)} sigma)`;
  }

  return {
    action,
    zScore: Math.round(zScore * 1e4) / 1e4,
    spread,
    hedgeRatio: currentHedgeRatio,
    reason,
  };
}
