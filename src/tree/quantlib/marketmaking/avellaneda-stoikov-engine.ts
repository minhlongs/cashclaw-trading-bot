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

export class AvellanedaStoikovEngine {
  calculateQuote(
    midPrice: number,
    inventory: number,
    params: AvellanedaStoikovParams,
  ): AvellanedaStoikovQuote {
    const s = Math.max(1e-8, midPrice);
    const gamma = Math.max(0, params.gamma);
    const sigma = Math.max(0, params.sigma);
    const tRemaining = Math.max(0, params.timeRemaining);
    const kappa = Math.max(0.01, params.kappa);

    const varianceTerm = gamma * sigma * sigma * tRemaining;
    const reservationPrice = s - inventory * varianceTerm;

    const rawHalfSpread = gamma > 1e-5
      ? (1 / gamma) * Math.log(1 + gamma / kappa)
      : (1 / kappa) * (1 - (0.5 * gamma) / kappa);

    const halfSpread = Math.min(s * 0.9, Math.max(1e-6, rawHalfSpread));
    const bidPrice = Math.max(1e-6, reservationPrice - halfSpread);
    const askPrice = Math.max(bidPrice + 1e-6, reservationPrice + halfSpread);

    return {
      reservationPrice: Number(reservationPrice.toFixed(6)),
      optimalSpread: Number((askPrice - bidPrice).toFixed(6)),
      bidPrice: Number(bidPrice.toFixed(6)),
      askPrice: Number(askPrice.toFixed(6)),
      bidOffset: Number((s - bidPrice).toFixed(6)),
      askOffset: Number((askPrice - s).toFixed(6)),
    };
  }
}
