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
