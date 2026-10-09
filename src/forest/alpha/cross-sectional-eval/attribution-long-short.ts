import type { RebalanceRecord } from '@/tree/alpha/cross-sectional/types';

export interface PreciseAttributionInput {
  readonly weights: Record<string, number>;
  readonly assetReturns: Record<string, number>;
}

export interface LongShortAttributionResult {
  readonly longSidePnl: number;
  readonly shortSidePnl: number;
}

export function attributeLongShortPrecise(inputs: readonly PreciseAttributionInput[]): LongShortAttributionResult {
  let longSum = 0, shortSum = 0;
  for (const { weights, assetReturns } of inputs) {
    for (const [symbol, weight] of Object.entries(weights)) {
      const r = assetReturns[symbol];
      if (r === undefined) throw new Error(`attributeLongShortPrecise: missing return for held symbol '${symbol}'`);
      const contrib = weight * r;
      if (weight > 0) longSum += contrib;
      else if (weight < 0) shortSum += contrib;
    }
  }
  return { longSidePnl: longSum, shortSidePnl: shortSum };
}

export function attributeLongShortProportional(periods: readonly RebalanceRecord[]): LongShortAttributionResult {
  let longSum = 0, shortSum = 0;
  for (const p of periods) {
    let longGross = 0, shortGross = 0;
    for (const w of Object.values(p.weights)) {
      if (w > 0) longGross += w;
      else if (w < 0) shortGross += -w;
    }
    const totalGross = longGross + shortGross;
    if (totalGross === 0) continue;
    longSum += p.grossReturn * (longGross / totalGross);
    shortSum += p.grossReturn * (shortGross / totalGross);
  }
  return { longSidePnl: longSum, shortSidePnl: shortSum };
}
