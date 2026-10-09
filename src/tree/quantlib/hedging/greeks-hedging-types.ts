export interface PortfolioGreeks {
  readonly delta: number;
  readonly gamma: number;
  readonly vega: number;
}

export interface GreeksRiskLimits {
  readonly maxDeltaExposure: number;
  readonly maxGammaExposure: number;
  readonly maxVegaExposure: number;
}

export interface RebalanceHedgeOrder {
  readonly instrument: 'PERP_UNDERLYING' | 'OPTION_STRADDLE';
  readonly action: 'BUY' | 'SELL';
  readonly quantity: number;
  readonly rationale: string;
}

export interface GreeksHedgingResult {
  readonly currentGreeks: PortfolioGreeks;
  readonly isBreached: boolean;
  readonly rebalanceOrders: readonly RebalanceHedgeOrder[];
}
