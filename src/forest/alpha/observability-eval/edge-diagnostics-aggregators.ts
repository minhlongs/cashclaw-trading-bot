import type { AlphaDecisionRecord } from '../../../tree/alpha/observability/types';
import type { RegimeLabel } from '../../../tree/regime/types';
import type { AlphaEdgeAttribution, RegimeEdgeAttribution } from './types';

export const round8 = (v: number): number => Number(v.toFixed(8));
export const round4 = (v: number): number => Number(v.toFixed(4));

export interface IntermediateRecord {
  readonly alphaId: string;
  readonly regime: RegimeLabel;
  readonly expNet: number;
  readonly realNet: number;
  readonly delta: number;
}

export function resolveRealizedReturn(
  decision: AlphaDecisionRecord,
  realizedReturns?: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
): number {
  if (realizedReturns) {
    const compositeKey = `${decision.alphaId}:${decision.timestamp}`;
    if ('get' in realizedReturns && typeof realizedReturns.get === 'function') {
      const map = realizedReturns as ReadonlyMap<string, number>;
      if (map.has(compositeKey)) return map.get(compositeKey)!;
      if (map.has(decision.alphaId)) return map.get(decision.alphaId)!;
      if (decision.symbol && map.has(decision.symbol)) return map.get(decision.symbol)!;
    } else {
      const rec = realizedReturns as Readonly<Record<string, number>>;
      if (compositeKey in rec && rec[compositeKey] !== undefined) return rec[compositeKey]!;
      if (decision.alphaId in rec && rec[decision.alphaId] !== undefined) return rec[decision.alphaId]!;
      if (decision.symbol && decision.symbol in rec && rec[decision.symbol] !== undefined) {
        return rec[decision.symbol]!;
      }
    }
  }
  return round8(decision.expectedReturn - decision.expectedCost);
}

export function computeSharpe(returns: readonly number[]): number | null {
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  if (variance <= 1e-12) return null;
  const std = Math.sqrt(variance);
  return round4(mean / std);
}

export function aggregateAlpha(records: readonly IntermediateRecord[]): AlphaEdgeAttribution {
  const count = records.length;
  const expSum = records.reduce((acc, r) => acc + r.expNet, 0);
  const realSum = records.reduce((acc, r) => acc + r.realNet, 0);
  const deltaSum = records.reduce((acc, r) => acc + r.delta, 0);
  const winCount = records.filter((r) => r.realNet > 0).length;
  const returns = records.map((r) => r.realNet);

  return {
    alphaId: records[0]?.alphaId ?? 'unknown',
    decisionCount: count,
    expectedNetReturnMean: round8(expSum / count),
    realizedNetReturnMean: round8(realSum / count),
    edgeDeltaMean: round8(deltaSum / count),
    winRate: round4(winCount / count),
    sharpe: computeSharpe(returns),
  };
}

export function aggregateRegime(records: readonly IntermediateRecord[]): RegimeEdgeAttribution {
  const count = records.length;
  const expSum = records.reduce((acc, r) => acc + r.expNet, 0);
  const realSum = records.reduce((acc, r) => acc + r.realNet, 0);
  const deltaSum = records.reduce((acc, r) => acc + r.delta, 0);

  return {
    regime: records[0]!.regime,
    decisionCount: count,
    expectedNetReturnMean: round8(expSum / count),
    realizedNetReturnMean: round8(realSum / count),
    edgeDeltaMean: round8(deltaSum / count),
  };
}
