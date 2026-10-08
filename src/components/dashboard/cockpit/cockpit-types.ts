// Cockpit UI Component Contracts
export interface L2DepthLevel {
  readonly price: number;
  readonly size: number;
  readonly total: number;
}

export interface CockpitDepthData {
  readonly bids: readonly L2DepthLevel[];
  readonly asks: readonly L2DepthLevel[];
  readonly spreadUsd: number;
}

export interface MicrostructureGaugeData {
  readonly ofiSignal: number; // -1.0 .. 1.0
  readonly vpinToxicity: number; // 0.0 .. 1.0
  readonly status: 'HEALTHY' | 'CAUTION' | 'TOXIC';
}

export interface FleetRiskRadarData {
  readonly strategyWeights: readonly { strategy: string; weightPct: number }[];
  readonly fractionalKellyLeverage: number;
  readonly circuitBreakerDrawdownPct: number;
  readonly circuitBreakerMaxPct: number;
  readonly isTriggered: boolean;
}
