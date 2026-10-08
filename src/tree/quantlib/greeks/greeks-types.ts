export type OptionType = 'call' | 'put';

export interface GreeksMetrics {
  readonly delta: number;
  readonly gamma: number;
  readonly vega: number;
  readonly theta: number;
  readonly price: number;
}

export interface SyntheticPosition {
  readonly symbol: string;
  readonly notionalQuantity: number;
  readonly isPerpOrSpot: boolean; // Spot/Perp has Delta = 1.0, Gamma/Vega/Theta = 0
  readonly optionType?: OptionType;
  readonly strikePrice?: number;
  readonly spotPrice: number;
  readonly impliedVol: number; // e.g. 0.65 for 65% annualized vol
  readonly timeToExpiryYears?: number; // e.g. 30 / 365
}

export interface PortfolioGreeksSummary {
  readonly netDelta: number;
  readonly netGamma: number;
  readonly netVega: number;
  readonly netTheta: number;
  readonly requiresHedging: boolean;
  readonly suggestedHedgeQuantity: number; // Counter-delta order size in underlying
}
