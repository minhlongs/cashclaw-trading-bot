import { resolveStressConfig, type StressMode } from '../cost-stress';
import type { ShadowFill } from './types';
import type {
  EdgeAttributionParams,
  EdgeAttributionResult,
  SlippageAttributionResult,
} from './attribution-types';

export const round8 = (v: number): number => Number(v.toFixed(8));

export function resolveRealizedNetReturn(p: EdgeAttributionParams): number {
  if (p.realizedNetReturn !== undefined) return p.realizedNetReturn;
  if (p.entryPrice === undefined || p.exitPrice === undefined) {
    throw new Error('Must provide realizedNetReturn or entryPrice and exitPrice');
  }
  const side = p.side ?? (p.record?.direction === 'sell' ? 'sell' : 'buy');
  const gross = side === 'sell' ? (p.entryPrice - p.exitPrice) / p.entryPrice : (p.exitPrice - p.entryPrice) / p.entryPrice;
  const feeRate = p.fillNotional && p.fillNotional > 0 && p.feeAmount !== undefined ? p.feeAmount / p.fillNotional : (p.feePct ?? 0);
  return gross - feeRate;
}

export function computeSingleEdge(p: EdgeAttributionParams): EdgeAttributionResult {
  const expRet = p.expectedReturn ?? p.record?.expectedReturn;
  if (expRet === undefined) throw new Error('expectedReturn is required');
  const expCost = p.expectedCost ?? p.record?.expectedCost ?? 0;
  const expNet = round8(expRet - expCost);
  const realNet = round8(resolveRealizedNetReturn(p));
  return {
    alphaId: p.alphaId ?? p.record?.alphaId, regime: p.regime ?? p.record?.regime,
    expectedReturn: expRet, expectedCost: expCost, expectedNetReturn: expNet,
    realizedNetReturn: realNet, deltaEdge: round8(realNet - expNet),
  };
}

export function computeSingleSlippage(fill: ShadowFill, expectedOverride?: number): SlippageAttributionResult {
  const expBps = expectedOverride ?? resolveStressConfig(fill.stressTier as StressMode).slipPct * 10_000;
  return {
    fillId: fill.fillId, symbol: fill.symbol, side: fill.side, stressTier: fill.stressTier,
    realizedSlippageBps: fill.slippageBps, expectedSlippageBps: Number(expBps.toFixed(4)),
    deltaSlippageBps: Number((fill.slippageBps - expBps).toFixed(4)),
  };
}
