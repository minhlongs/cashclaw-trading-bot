import type { RegimeLabel } from '../../regime/types';
import type { AlphaDecisionRecord, CostStressTier, ShadowOrderSide } from './types';

export interface EdgeAttributionParams {
  readonly record?: AlphaDecisionRecord; readonly alphaId?: string; readonly regime?: RegimeLabel;
  readonly expectedReturn?: number; readonly expectedCost?: number; readonly realizedNetReturn?: number;
  readonly entryPrice?: number; readonly exitPrice?: number; readonly side?: ShadowOrderSide | 'hold';
  readonly feeAmount?: number; readonly fillNotional?: number; readonly feePct?: number;
}
export interface EdgeAttributionResult {
  readonly alphaId?: string; readonly regime?: RegimeLabel; readonly expectedReturn: number;
  readonly expectedCost: number; readonly expectedNetReturn: number; readonly realizedNetReturn: number; readonly deltaEdge: number;
}
export interface EdgeAggregationSummary {
  readonly count: number; readonly meanExpectedNetReturn: number; readonly meanRealizedNetReturn: number; readonly meanDeltaEdge: number;
}
export interface BatchEdgeAttributionResult {
  readonly count: number; readonly meanExpectedNetReturn: number; readonly meanRealizedNetReturn: number; readonly meanDeltaEdge: number;
  readonly byAlphaId: Readonly<Record<string, EdgeAggregationSummary>>; readonly byRegime: Readonly<Record<string, EdgeAggregationSummary>>;
  readonly records: readonly EdgeAttributionResult[];
}
export interface SlippageAttributionResult {
  readonly fillId: string; readonly symbol: string; readonly side: ShadowOrderSide; readonly stressTier: CostStressTier;
  readonly realizedSlippageBps: number; readonly expectedSlippageBps: number; readonly deltaSlippageBps: number;
}
export interface SlippageAggregationSummary {
  readonly count: number; readonly meanRealizedSlippageBps: number; readonly meanExpectedSlippageBps: number; readonly meanDeltaSlippageBps: number;
}
export interface BatchSlippageAttributionResult {
  readonly count: number; readonly meanRealizedSlippageBps: number; readonly meanExpectedSlippageBps: number; readonly meanDeltaSlippageBps: number;
  readonly byStressTier: Readonly<Record<CostStressTier, SlippageAggregationSummary>>;
  readonly bySide: Readonly<Record<ShadowOrderSide, SlippageAggregationSummary>>;
  readonly records: readonly SlippageAttributionResult[];
}
