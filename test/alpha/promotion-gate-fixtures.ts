import {
  checkFeeStress,
  checkMaxDrawdown,
  checkMinNetExpectancy,
  checkMinProfitFactor,
  checkMinRegimeCoverage,
  checkMinSharpeSortino,
  checkMinTrades,
  checkSlippageStress,
  DEFAULT_PROMOTION_GATE_CONFIG,
  type GateCheck,
  type GateCheckName,
  type PromotionGateConfig,
  type PromotionGateResult,
} from '@/forest/alpha/gate/index';

export type { GateCheckName, GateCheck, PromotionGateConfig, PromotionGateResult };
export { DEFAULT_PROMOTION_GATE_CONFIG };

export interface BaselineMetric {
  readonly sharpe: number | null;
  readonly netPnl: number;
}

export interface HashVerificationInput {
  readonly hashMatches?: boolean;
  readonly recordedHash?: string;
  readonly gitSha?: string;
  readonly seed?: number | null;
  readonly config?: unknown;
}

export interface PromotionGateInput {
  readonly numTrades: number;
  readonly expectancy: number;
  readonly profitFactor: number;
  readonly maxDrawdown: number;
  readonly sharpe: number | null;
  readonly sortino: number | null;
  readonly byRegime: Record<string, { readonly numTrades?: number; readonly netPnl?: number }>;
  readonly feeStress: { readonly netPnlNormal: number; readonly netPnlConservative: number };
  readonly slippageStress: { readonly netPnlAdverse: number; readonly netPnlExtreme: number };
  readonly parameterSensitivitySpread: number;
  readonly walkForwardPositiveFraction: number;
  readonly crossAsset: { readonly positiveAssetFraction: number; readonly applicable?: boolean };
  readonly leakageViolations: number;
  readonly windowPnls: readonly number[];
  readonly baselineComparison: {
    readonly candidate: { readonly sharpe: number; readonly netPnl: number };
    readonly buyHold: BaselineMetric;
    readonly randomEntry: BaselineMetric;
  };
  readonly hashVerification: HashVerificationInput;
}

export const evalMinTrades = checkMinTrades;
export const evalMinNetExpectancy = checkMinNetExpectancy;
export const evalMinProfitFactor = checkMinProfitFactor;
export const evalMaxDrawdown = checkMaxDrawdown;
export const evalMinSharpeSortino = checkMinSharpeSortino;
export const evalMinRegimeCoverage = checkMinRegimeCoverage;
export const evalFeeStress = checkFeeStress;
export const evalSlippageStress = checkSlippageStress;

export * from './promotion-gate-evaluators';
