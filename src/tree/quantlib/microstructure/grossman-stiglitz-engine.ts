import {
  GrossmanStiglitzConfig,
  GrossmanStiglitzEquilibrium,
} from './grossman-stiglitz-types';

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
