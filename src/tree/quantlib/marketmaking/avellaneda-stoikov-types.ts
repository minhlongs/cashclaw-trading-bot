export interface AvellanedaStoikovParams {
  readonly gamma: number; // Inventory risk aversion (> 0)
  readonly sigma: number; // Volatility (> 0)
  readonly timeRemaining: number; // Remaining horizon T - t (> 0)
  readonly kappa: number; // Order book liquidity intensity parameter (> 0)
}

export interface AvellanedaStoikovQuote {
  readonly reservationPrice: number;
  readonly optimalSpread: number;
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly bidOffset: number;
  readonly askOffset: number;
}
