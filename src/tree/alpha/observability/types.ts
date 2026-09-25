import type { RegimeLabel } from '../../regime/types';

/** Nominal branded SHA-256 hash string (64 lowercase hexadecimal characters). */
export type FeatureSnapshotHash = string & { readonly __brand: 'FeatureSnapshotHash' };

/** Direction of an alpha decision signal. */
export type AlphaDecisionDirection = 'buy' | 'sell' | 'hold';

/** Record of a single alpha decision at timestamp t with causal feature snapshot link. */
export interface AlphaDecisionRecord {
  readonly alphaId: string;
  readonly direction: AlphaDecisionDirection;
  readonly confidence: number;
  readonly expectedReturn: number;
  readonly expectedCost: number;
  readonly expectedTurnover: number;
  readonly regime: RegimeLabel;
  readonly horizon: string;
  readonly featureDependencies: readonly string[];
  readonly featureSnapshotHash: FeatureSnapshotHash;
  readonly timestamp: number;
  readonly symbol?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Record of portfolio optimizer and risk overlay decision. */
export interface PortfolioDecisionRecord {
  readonly targetWeights: Readonly<Record<string, number>>;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly volTargetingScale: number;
  readonly activeRiskOverlayAdjustments: readonly string[];
  readonly timestamp: number;
  readonly decisionId?: string;
  readonly totalTurnover?: number;
  readonly drawdownDeRisked?: boolean;
}

/** Provider circuit breaker state. */
export type ProviderCircuitState = 'closed' | 'open' | 'half_open' | 'degraded';

/** Provider provenance tracking primary vs fallback data providers. */
export interface ProviderProvenance {
  readonly primaryProvider: string;
  readonly activeProvider: string;
  readonly usedFallback: boolean;
  readonly fallbackAttempts: number;
  readonly providerLatencyMs?: number;
  readonly circuitState?: ProviderCircuitState;
  readonly errors?: readonly string[];
}

/** Operational telemetry captured at the decision instant. */
export interface OperationalTelemetry {
  readonly decisionLatencyMs: number;
  readonly dataFreshnessMs: number;
  readonly providerProvenance: ProviderProvenance;
  readonly timestamp?: number;
}

/** Cost stress tier for hypothetical shadow execution. */
export type CostStressTier = 'normal' | 'conservative' | 'adverse' | 'extreme';

/** Side of a hypothetical shadow order. */
export type ShadowOrderSide = 'buy' | 'sell';

/** Forward-compatible hypothetical shadow order. */
export interface ShadowOrder {
  readonly orderId: string;
  readonly symbol: string;
  readonly side: ShadowOrderSide;
  readonly size: number;
  readonly price: number;
  readonly targetWeightDelta: number;
  readonly decisionTimestamp: number;
}

/** Forward-compatible hypothetical shadow fill. */
export interface ShadowFill {
  readonly fillId: string;
  readonly orderId: string;
  readonly symbol: string;
  readonly side: ShadowOrderSide;
  readonly fillPrice: number;
  readonly fillQuantity: number;
  readonly fillTimestamp: number;
  readonly feeAmount: number;
  readonly slippageBps: number;
  readonly stressTier: CostStressTier;
}
