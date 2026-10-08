// Cartea-Jaimungal (2014) Closed-Form Optimal Market Making Engine
// Solves the optimal quoting HJB equation incorporating short-term directional alpha drift.

import type {
  CarteaJaimungalModelParams,
  CarteaJaimungalQuote,
} from './cartea-jaimungal-types';

export class CarteaJaimungalEngine {
  private readonly params: CarteaJaimungalModelParams;
  private readonly c0: number;
  private readonly c1: number;

  constructor(params: CarteaJaimungalModelParams) {
    if (params.gamma <= 0 || params.kappa <= 0 || params.A <= 0 || params.sigma <= 0) {
      throw new Error('All Cartea-Jaimungal parameters (gamma, kappa, A, sigma) must be strictly positive.');
    }
    this.params = params;

    const { gamma, kappa, A, sigma } = params;
    const ratio = gamma / kappa;
    const base = 1 + ratio;

    // Asymptotic base half-spread: C0 = (1 / gamma) * ln(1 + gamma / kappa)
    this.c0 = (1 / gamma) * Math.log(base);

    // Inventory sensitivity coefficient:
    // C1 = sqrt((gamma * sigma^2) / (2 * kappa * A) * (1 + gamma / kappa)^(kappa / gamma + 1))
    const exponent = 1 / ratio + 1;
    const factor = Math.pow(base, exponent);
    const varianceTerm = (gamma * sigma * sigma) / (2 * kappa * A);
    this.c1 = Math.sqrt(varianceTerm * factor);
  }

  /**
   * Computes optimal bid and ask spreads and prices given current inventory, mid price, and alpha drift.
   * @param inventory Current inventory units q (positive = long, negative = short).
   * @param midPrice Reference market mid price S.
   * @param alphaDrift Short-term drift rate alpha(t) in price units per unit time.
   */
  computeOptimalQuotes(
    inventory: number,
    midPrice: number,
    alphaDrift = 0,
  ): CarteaJaimungalQuote {
    if (midPrice <= 0 || !Number.isFinite(midPrice)) {
      throw new Error('Mid price must be positive and finite.');
    }

    const q = Number.isFinite(inventory) ? inventory : 0;
    const alpha = Number.isFinite(alphaDrift) ? alphaDrift : 0;
    const driftTerm = alpha / this.params.kappa;

    // delta_b*(q, alpha) = C0 + (2q + 1) / 2 * C1 - alpha / kappa
    const deltaBid = this.c0 + ((2 * q + 1) / 2) * this.c1 - driftTerm;

    // delta_a*(q, alpha) = C0 - (2q - 1) / 2 * C1 + alpha / kappa
    const deltaAsk = this.c0 - ((2 * q - 1) / 2) * this.c1 + driftTerm;

    const bidPrice = midPrice - deltaBid;
    const askPrice = midPrice + deltaAsk;
    const skew = (deltaAsk - deltaBid) / 2;

    return {
      deltaBid,
      deltaAsk,
      totalSpread: deltaBid + deltaAsk,
      midPrice,
      bidPrice,
      askPrice,
      skew,
      inventory: q,
      alphaDrift: alpha,
    };
  }

  getParams(): CarteaJaimungalModelParams {
    return { ...this.params };
  }

  getBaseCoefficients(): { c0: number; c1: number } {
    return { c0: this.c0, c1: this.c1 };
  }
}
