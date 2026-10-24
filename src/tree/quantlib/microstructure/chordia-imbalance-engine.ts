export function computeChordiaOrderImbalance(p: ChordiaImbalanceParams): ChordiaImbalanceResult {
  const b = Math.max(0, p.buyerVolume), s = Math.max(0, p.sellerVolume);
  const v = Math.max(0, p.returnVolatility ?? 0);
  const baseline = Math.max(0.1, p.baselineSpreadBps ?? 1.5);
  const gamma1 = Math.max(0, p.imbalanceSensitivity ?? 2.0);
  const betaRev = Math.max(0, p.reversalCoefficient ?? 0.5);
  const oibShares = b - s, total = b + s;
  const oibRatio = total > 0 ? oibShares / total : 0;
  const adversePressure = gamma1 * Math.abs(oibRatio);
  const spreadBps = baseline + adversePressure + 50 * v;
  const rawReversal = -betaRev * oibRatio;
  const expectedReversal = Object.is(rawReversal, -0) ? 0 : rawReversal;
  return { orderImbalanceShares: oibShares, orderImbalanceRatio: oibRatio, dynamicSpreadBps: spreadBps, expectedReversalBps: expectedReversal, adversePressureBps: adversePressure, isLiquidityDrained: Math.abs(oibRatio) >= 0.5 };
}

export interface ChordiaImbalanceParams {
  readonly buyerVolume: number;
  readonly sellerVolume: number;
  readonly returnVolatility?: number;
  readonly baselineSpreadBps?: number;
  readonly imbalanceSensitivity?: number;
  readonly reversalCoefficient?: number;
}

export interface ChordiaImbalanceResult {
  readonly orderImbalanceShares: number;
  readonly orderImbalanceRatio: number;
  readonly dynamicSpreadBps: number;
  readonly expectedReversalBps: number;
  readonly adversePressureBps: number;
  readonly isLiquidityDrained: boolean;
}
