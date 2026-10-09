import type { OperationalTelemetry, ShadowFill } from './types';
import {
  evaluateOperationalTelemetryBatch,
  type OperationalTelemetryConfig,
  type OperationalTelemetrySummary,
  type OperationalAlarmType,
  type OperationalAlarm,
  type LatencyStats,
  type FreshnessStats,
  type ProviderStats,
  type ProviderProvenanceSummary,
} from './attribution-telemetry';
import type {
  EdgeAttributionParams,
  EdgeAttributionResult,
  EdgeAggregationSummary,
  BatchEdgeAttributionResult,
  SlippageAttributionResult,
  SlippageAggregationSummary,
  BatchSlippageAttributionResult,
} from './attribution-types';
import {
  computeSingleEdge,
  computeSingleSlippage,
} from './attribution-cost-calculators';
import {
  computeBatchEdgeAttribution,
  computeBatchSlippageAttribution,
} from './attribution-batch-calculators';

export type {
  OperationalTelemetryConfig,
  OperationalTelemetrySummary,
  OperationalAlarmType,
  OperationalAlarm,
  LatencyStats,
  FreshnessStats,
  ProviderStats,
  ProviderProvenanceSummary,
  EdgeAttributionParams,
  EdgeAttributionResult,
  EdgeAggregationSummary,
  BatchEdgeAttributionResult,
  SlippageAttributionResult,
  SlippageAggregationSummary,
  BatchSlippageAttributionResult,
};
export { evaluateOperationalTelemetryBatch, computeBatchEdgeAttribution, computeBatchSlippageAttribution };

export function computeEdgeAttribution(p: EdgeAttributionParams): EdgeAttributionResult;
export function computeEdgeAttribution(p: readonly EdgeAttributionParams[]): BatchEdgeAttributionResult;
export function computeEdgeAttribution(p: EdgeAttributionParams | readonly EdgeAttributionParams[]): EdgeAttributionResult | BatchEdgeAttributionResult {
  return Array.isArray(p) ? computeBatchEdgeAttribution(p) : computeSingleEdge(p as EdgeAttributionParams);
}

export function computeSlippageAttribution(f: ShadowFill, o?: number): SlippageAttributionResult;
export function computeSlippageAttribution(f: readonly ShadowFill[], o?: number): BatchSlippageAttributionResult;
export function computeSlippageAttribution(f: ShadowFill | readonly ShadowFill[], o?: number): SlippageAttributionResult | BatchSlippageAttributionResult {
  return Array.isArray(f) ? computeBatchSlippageAttribution(f, o) : computeSingleSlippage(f as ShadowFill, o);
}

export function evaluateOperationalTelemetry(telemetry: OperationalTelemetry, config?: OperationalTelemetryConfig): OperationalTelemetrySummary {
  return evaluateOperationalTelemetryBatch([telemetry], config);
}
