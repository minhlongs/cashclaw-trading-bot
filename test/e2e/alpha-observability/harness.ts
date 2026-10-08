import { resolveStressConfig, type StressMode } from '@/tree/alpha/cost-stress';
import { RegimeLabel } from '@/tree/regime/types';
import {
  AlphaDecisionRecordSchema,
  OperationalTelemetrySchema,
  PortfolioDecisionRecordSchema,
  ShadowFillSchema,
  ShadowOrderSchema,
  computeFeatureSnapshotHashSync,
  type AlphaDecisionRecord,
  type CostStressTier,
  type OperationalTelemetry,
  type PortfolioDecisionRecord,
  type ShadowFill,
  type ShadowOrder,
  type ShadowOrderSide,
} from '@/tree/alpha/observability';

export interface MockTick {
  readonly symbol: string;
  readonly price: number;
  readonly timestamp: number;
}

export interface TelemetryHealthResult {
  readonly status: 'healthy' | 'degraded' | 'critical';
  readonly alarms: readonly string[];
}

export interface AttributionResult {
  readonly expectedNetReturn: number;
  readonly realizedNetReturn: number;
  readonly deltaEdge: number;
  readonly deltaSlippageBps: number;
}

export function createMockTickStream(symbol: string, basePrice: number, count: number, stepMs = 1000): MockTick[] {
  const baseTime = 1710000000000;
  return Array.from({ length: count }, (_, i) => ({
    symbol,
    price: Number((basePrice * (1 + Math.sin(i / 5) * 0.005)).toFixed(4)),
    timestamp: baseTime + i * stepMs,
  }));
}

export function createSyntheticAlphaDecision(overrides: Partial<AlphaDecisionRecord> = {}): AlphaDecisionRecord {
  const features = overrides.metadata ?? { rsi: 55, mom: 0.02 };
  return AlphaDecisionRecordSchema.parse({
    alphaId: 'alpha-mom-v1',
    direction: 'buy',
    confidence: 0.85,
    expectedReturn: 0.015,
    expectedCost: 0.002,
    expectedTurnover: 0.25,
    regime: RegimeLabel.TREND_UP,
    horizon: '1h',
    featureDependencies: ['rsi', 'mom'],
    featureSnapshotHash: computeFeatureSnapshotHashSync(features),
    timestamp: 1710000000000,
    symbol: 'BTC/USDT',
    ...overrides,
  });
}

export function createSyntheticPortfolioDecision(overrides: Partial<PortfolioDecisionRecord> = {}): PortfolioDecisionRecord {
  return PortfolioDecisionRecordSchema.parse({
    targetWeights: { 'BTC/USDT': 0.6, 'ETH/USDT': 0.4 },
    grossExposure: 1.0,
    netExposure: 1.0,
    volTargetingScale: 1.0,
    activeRiskOverlayAdjustments: [],
    timestamp: 1710000000000,
    ...overrides,
  });
}

export function createSyntheticOperationalTelemetry(overrides: Partial<OperationalTelemetry> = {}): OperationalTelemetry {
  return OperationalTelemetrySchema.parse({
    decisionLatencyMs: 45,
    dataFreshnessMs: 120,
    providerProvenance: {
      primaryProvider: 'binance-ws',
      activeProvider: 'binance-ws',
      usedFallback: false,
      fallbackAttempts: 0,
      providerLatencyMs: 35,
      circuitState: 'closed',
    },
    timestamp: 1710000000000,
    ...overrides,
  });
}

export function generateShadowOrder(params: {
  orderId: string;
  symbol: string;
  deltaW: number;
  price: number;
  equity: number;
  timestamp: number;
}): ShadowOrder | null {
  if (Math.abs(params.deltaW) < 1e-6 || params.equity <= 0 || params.price <= 0) return null;
  const side: ShadowOrderSide = params.deltaW > 0 ? 'buy' : 'sell';
  const size = Number((Math.abs(params.deltaW) * params.equity).toFixed(4));
  return ShadowOrderSchema.parse({
    orderId: params.orderId,
    symbol: params.symbol,
    side,
    size,
    price: params.price,
    targetWeightDelta: params.deltaW,
    decisionTimestamp: params.timestamp,
  });
}

export function simulateShadowFill(params: {
  order: ShadowOrder;
  arrivalPrice: number;
  latencyMs: number;
  stressTier: CostStressTier;
  fillId?: string;
}): ShadowFill {
  const stress = resolveStressConfig(params.stressTier as StressMode);
  const totalSlip = stress.slipPct + stress.marketImpactPct;
  const fillPrice = params.order.side === 'buy'
    ? params.arrivalPrice * (1 + totalSlip)
    : params.arrivalPrice * (1 - totalSlip);
  const fillQuantity = params.order.size / params.order.price;
  const feeAmount = fillPrice * fillQuantity * stress.feePct;
  const sideFactor = params.order.side === 'buy' ? 1 : -1;
  const slippageBps = ((sideFactor * (fillPrice - params.order.price)) / params.order.price) * 10000;

  return ShadowFillSchema.parse({
    fillId: params.fillId ?? `fill-${params.order.orderId}`,
    orderId: params.order.orderId,
    symbol: params.order.symbol,
    side: params.order.side,
    fillPrice: Number(fillPrice.toFixed(4)),
    fillQuantity: Number(fillQuantity.toFixed(6)),
    fillTimestamp: params.order.decisionTimestamp + params.latencyMs,
    feeAmount: Number(feeAmount.toFixed(4)),
    slippageBps: Number(slippageBps.toFixed(2)),
    stressTier: params.stressTier,
  });
}

export function computeAttribution(params: {
  expectedReturn: number;
  expectedCost: number;
  realizedFillPrice: number;
  exitPrice: number;
  side: ShadowOrderSide;
  feeAmount: number;
  fillNotional: number;
  expectedSlippageBps: number;
  realizedSlippageBps: number;
}): AttributionResult {
  const expectedNetReturn = params.expectedReturn - params.expectedCost;
  const grossReturn = params.side === 'buy'
    ? (params.exitPrice - params.realizedFillPrice) / params.realizedFillPrice
    : (params.realizedFillPrice - params.exitPrice) / params.realizedFillPrice;
  const feeRate = params.fillNotional > 0 ? params.feeAmount / params.fillNotional : 0;
  const realizedNetReturn = grossReturn - feeRate;
  return {
    expectedNetReturn: Number(expectedNetReturn.toFixed(6)),
    realizedNetReturn: Number(realizedNetReturn.toFixed(6)),
    deltaEdge: Number((realizedNetReturn - expectedNetReturn).toFixed(6)),
    deltaSlippageBps: Number((params.realizedSlippageBps - params.expectedSlippageBps).toFixed(2)),
  };
}

export function evaluateTelemetryHealth(telemetry: OperationalTelemetry): TelemetryHealthResult {
  const alarms: string[] = [];
  if (telemetry.dataFreshnessMs > 5000) alarms.push('STALE_DATA');
  if (telemetry.decisionLatencyMs > 3000) alarms.push('HIGH_LATENCY');
  if (telemetry.providerProvenance.usedFallback) alarms.push('PROVIDER_FALLBACK');
  const circuit = telemetry.providerProvenance.circuitState;
  if (circuit === 'degraded' || circuit === 'open') alarms.push('CIRCUIT_DEGRADED');

  const status: 'healthy' | 'degraded' | 'critical' =
    alarms.includes('STALE_DATA') || alarms.includes('HIGH_LATENCY')
      ? 'critical'
      : alarms.length > 0
        ? 'degraded'
        : 'healthy';

  return { status, alarms };
}
