import type { ExchangeId } from '../../types';

export interface LegPosition {
  readonly exchange: ExchangeId;
  readonly symbol: string;
  readonly side: 'long' | 'short';
  readonly quantity: number;
  readonly entryPrice: number;
  readonly markPrice: number;
}

export interface DualLegPortfolio {
  readonly legA: LegPosition;
  readonly legB: LegPosition;
  readonly collateralUsd: number;
}

export interface DeltaExposure {
  readonly legANotional: number;
  readonly legBNotional: number;
  readonly netDeltaNotional: number;
  readonly totalGrossNotional: number;
  readonly deltaDriftRatio: number;
  readonly isDriftExceeded: boolean;
}

export interface RebalanceAction {
  readonly requiresRebalance: boolean;
  readonly targetLegIndex: 'A' | 'B' | null;
  readonly side: 'buy' | 'sell' | null;
  readonly adjustmentQuantity: number;
  readonly estimatedNotional: number;
  readonly reason: string;
}

export interface MarginSafetyState {
  readonly totalCollateral: number;
  readonly totalNotional: number;
  readonly effectiveLeverage: number;
  readonly marginUtilizationPct: number;
  readonly liquidationDistancePct: number;
  readonly isMarginWarning: boolean;
  readonly isLiquidationCritical: boolean;
}
