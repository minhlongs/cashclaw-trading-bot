// Cartea-Jaimungal (2014) Alpha-Informed Optimal Market Making Types
// Mathematical contracts for HJB optimal quoting with short-term drift alpha(t).

export interface CarteaJaimungalModelParams {
  /** Inventory risk aversion parameter gamma > 0 */
  gamma: number;
  /** Order execution intensity decay exponent kappa > 0 */
  kappa: number;
  /** Baseline order arrival intensity parameter A > 0 */
  A: number;
  /** Asset return volatility sigma > 0 */
  sigma: number;
}

export interface CarteaJaimungalQuote {
  /** Optimal bid spread depth from mid price delta_b */
  deltaBid: number;
  /** Optimal ask spread depth from mid price delta_a */
  deltaAsk: number;
  /** Total quoted spread delta_b + delta_a */
  totalSpread: number;
  /** Reference mid price S */
  midPrice: number;
  /** Executable bid price S - delta_b */
  bidPrice: number;
  /** Executable ask price S + delta_a */
  askPrice: number;
  /** Quote skew / reservation midpoint shift from mid (delta_a - delta_b) / 2 */
  skew: number;
  /** Inventory position q */
  inventory: number;
  /** Alpha drift in price units per unit time */
  alphaDrift: number;
}
