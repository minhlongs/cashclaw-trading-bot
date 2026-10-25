export class GrossmanStiglitzEngine {
  public static calculateEquilibrium(config: GrossmanStiglitzConfig): GrossmanStiglitzEquilibrium {
    const { privateSignalCost: c, riskTolerance: r, fundamentalVariance: vTheta, noiseTradingVariance: vX } = config;
    if (c <= 0 || r <= 0 || vTheta <= 0 || vX <= 0) {
      throw new Error('Invalid Grossman-Stiglitz parameters: must be positive');
    }
    const costRatio = Math.exp((2 * c) / r) - 1;
    const numerator = vTheta / costRatio - vX;
    let lambdaStar = 0;
    if (numerator > 0) {
      lambdaStar = Math.min(1, Math.max(0, Math.sqrt(numerator / vTheta)));
    }
    const signalVariance = Math.pow(lambdaStar, 2) * vTheta;
    const informativeness = signalVariance / (signalVariance + vX);
    const utilityAdvantage = Math.log(1 + signalVariance / vX) - (2 * c) / r;
    return {
      equilibriumInformedFraction: lambdaStar,
      priceInformativeness: informativeness,
      isInformationallyEfficient: informativeness > 0.999 && lambdaStar === 1,
      expectedInformedUtilityAdvantage: utilityAdvantage,
    };
  }
}

/**
 * Grossman & Stiglitz (1980) Information Impossibility Types
 * Reference: Sanford J. Grossman & Joseph E. Stiglitz (1980), AER
 */

export interface GrossmanStiglitzConfig {
  privateSignalCost: number; // c > 0
  riskTolerance: number; // r = 1/a
  fundamentalVariance: number; // sigma_theta^2
  noiseTradingVariance: number; // sigma_x^2
}

export interface GrossmanStiglitzEquilibrium {
  equilibriumInformedFraction: number; // lambda* in [0, 1]
  priceInformativeness: number; // rho_P^2 in [0, 1]
  isInformationallyEfficient: boolean; // false under Stiglitz impossibility
  expectedInformedUtilityAdvantage: number;
}
