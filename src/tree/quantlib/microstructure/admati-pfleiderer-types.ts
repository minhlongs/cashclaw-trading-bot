/**
 * Admati & Pfleiderer (1988) Volume Clustering & Sunshine Trading Types
 * Reference: Anat R. Admati & Paul Pfleiderer (1988), RFS
 */

export interface AdmatiPfleidererPeriodInput {
  periodIndex: number;
  nondiscretionaryVolume: number; // inelastic base flow
  discretionaryTraders: number; // DLT count choosing this period
  informedTraders: number; // Informed trader count
}

export interface AdmatiPfleidererConfig {
  fundamentalVolatility: number;
  fixedExecutionCost: number;
  sunshineDisclosureBonus: number; // Discount if orders pre-announced
  periods: AdmatiPfleidererPeriodInput[];
}

export interface AdmatiPeriodMetric {
  periodIndex: number;
  totalVolume: number;
  effectiveAdverseSelection: number;
  expectedTransactionCost: number;
  isClusteredLiquidityPeak: boolean;
}

export interface AdmatiPfleidererResult {
  periods: AdmatiPeriodMetric[];
  highestLiquidityPeriod: number;
  intradayCostDispersion: number;
}
