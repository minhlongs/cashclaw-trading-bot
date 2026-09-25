export type {
  AlphaDecisionDirection,
  AlphaDecisionRecord,
  CostStressTier,
  FeatureSnapshotHash,
  OperationalTelemetry,
  PortfolioDecisionRecord,
  ProviderCircuitState,
  ProviderProvenance,
  ShadowFill,
  ShadowOrder,
  ShadowOrderSide,
} from './types';

export {
  AlphaDecisionDirectionSchema,
  AlphaDecisionRecordSchema,
  CostStressTierSchema,
  FeatureSnapshotHashSchema,
  OperationalTelemetrySchema,
  PortfolioDecisionRecordSchema,
  ProviderCircuitStateSchema,
  ProviderProvenanceSchema,
  ShadowFillSchema,
  ShadowOrderSchema,
  ShadowOrderSideSchema,
} from './schemas';

export {
  computeFeatureSnapshotHash,
  computeFeatureSnapshotHashSync,
  verifyFeatureSnapshotHash,
  verifyFeatureSnapshotHashSync,
} from './snapshot-hasher';

export type { GenerateShadowOrdersParams } from './order-generator';
export { generateShadowOrders } from './order-generator';

export type { SimulateShadowFillParams } from './shadow-simulator';
export { simulateShadowFill, simulateShadowFills } from './shadow-simulator';

export type {
  BatchEdgeAttributionResult,
  BatchSlippageAttributionResult,
  EdgeAggregationSummary,
  EdgeAttributionParams,
  EdgeAttributionResult,
  FreshnessStats,
  LatencyStats,
  OperationalAlarm,
  OperationalAlarmType,
  OperationalTelemetryConfig,
  OperationalTelemetrySummary,
  ProviderProvenanceSummary,
  ProviderStats,
  SlippageAggregationSummary,
  SlippageAttributionResult,
} from './attribution';

export {
  computeBatchEdgeAttribution,
  computeBatchSlippageAttribution,
  computeEdgeAttribution,
  computeSlippageAttribution,
  evaluateOperationalTelemetry,
  evaluateOperationalTelemetryBatch,
} from './attribution';
