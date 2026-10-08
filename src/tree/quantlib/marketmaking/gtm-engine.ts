// Guéant-Tapia-Manziadi (2012) Closed-Form Optimal Market Making Engine
// Pure mathematical implementation of HJB equation for continuous quoting with inventory risk.

import type { GtmModelParams, GtmQuoteSpread } from './gtm-types';

export class GtmEngine {
  private readonly params: GtmModelParams;
  private readonly c0: number;
  private readonly c1: number;

  constructor(params: GtmModelParams) {
    if (params.gamma <= 0 || params.kappa <= 0 || params.A <= 0 || params.sigma <= 0) {
      throw new Error('All GTM parameters (gamma, kappa, A, sigma) must be strictly positive.');
    }
    this.params = params;

    const { gamma, kappa, A, sigma } = params;
    const ratio = gamma / kappa;
    const base = 1 + ratio;

    // Asymptotic base half-spread: C0 = (1 / gamma) * ln(1 + gamma / kappa)
    this.c0 = (1 / gamma) * Math.log(base);

    // Inventory sensitivity coefficient:
    // C1 = sqrt((gamma * sigma^2) / (2 * kappa * A) * (1 + gamma / kappa)^(kappa / gamma + 1))
    const exponent = 1 / ratio + 1; // (kappa / gamma) + 1
    const factor = Math.pow(base, exponent);
    const varianceTerm = (gamma * sigma * sigma) / (2 * kappa * A);
    this.c1 = Math.sqrt(varianceTerm * factor);
  }

  /**
   * Computes optimal bid and ask spreads (delta_b and delta_a) relative to reference price.
   * @param inventory Current inventory units q (positive = long, negative = short).
   */
  computeOptimalSpreads(inventory: number): GtmQuoteSpread {
    const q = Number.isFinite(inventory) ? inventory : 0;
    // delta_b(q) = C0 + (2q + 1) / 2 * C1
    const deltaBid = this.c0 + ((2 * q + 1) / 2) * this.c1;
    // delta_a(q) = C0 - (2q - 1) / 2 * C1
    const deltaAsk = this.c0 - ((2 * q - 1) / 2) * this.c1;

    return {
      deltaBid,
      deltaAsk,
      totalSpread: deltaBid + deltaAsk,
      baseHalfSpread: this.c0,
    };
  }

  getParams(): GtmModelParams {
    return { ...this.params };
  }

  getBaseCoefficients(): { c0: number; c1: number } {
    return { c0: this.c0, c1: this.c1 };
  }
}
