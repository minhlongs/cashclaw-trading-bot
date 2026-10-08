// Extreme Market Stress & Copula CVaR Contracts
export interface LiquidityShockScenario {
  readonly scenarioName: string;
  readonly spreadMultiplier: number;
  readonly depthDepletionRatio: number; // e.g. 0.80 for 80% book evaporation
  readonly priceShockPct: number; // e.g. -0.25 for -25% flash crash
}

export interface StressedL2State {
  readonly originalSpread: number;
  readonly stressedSpread: number;
  readonly originalDepth: number;
  readonly stressedDepth: number;
  readonly shockedMidPrice: number;
}

export interface CopulaTailParams {
  readonly claytonTheta: number; // Theta > 0 for lower tail dependence
  readonly studentTDegreesOfFreedom?: number;
}

export interface CvarRiskMetrics {
  readonly confidenceLevel: number; // e.g. 0.99
  readonly parametricVarUsd: number;
  readonly expectedShortfallCvarUsd: number;
  readonly worstSimulatedLossUsd: number;
}
