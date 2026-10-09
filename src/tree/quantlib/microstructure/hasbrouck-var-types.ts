export interface TradeObservation {
  readonly midPrice: number;
  readonly tradeSign: number; // +1 buyer initiated, -1 seller initiated, 0 neutral
  readonly volume?: number;
}

export interface HasbrouckVarConfig {
  readonly lags?: number; // p lags (defaults to 1)
}

export interface HasbrouckVarResult {
  readonly priceImpactFactor: number; // Beta_0 (instantaneous price impact)
  readonly permanentPriceImpact: number; // Cumulative impulse response R_inf
  readonly informationShare: number; // Information share of trade innovations [0, 1]
  readonly autoregressiveReturnCoeff: number; // Alpha_1
  readonly laggedTradeImpactCoeff: number; // Beta_1
  readonly sampleCount: number;
}
