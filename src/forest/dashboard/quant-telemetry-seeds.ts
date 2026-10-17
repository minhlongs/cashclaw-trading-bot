import type { StressMode } from '@/tree/alpha/cost-stress';
import type { CostTierId, RegimeId } from './quant-telemetry-service';

export const TIER_TO_STRESS: Record<CostTierId, StressMode> = {
  BASE: 'normal',
  ELEVATED: 'adverse',
  EXTREME: 'extreme',
};

export const REGIME_SEEDS: ReadonlyArray<{
  regime: RegimeId;
  bars: number;
  grossSharpe: number;
  baseMaxDdPct: number;
  turnoverRate: number;
  volatility: number;
  simPrice: number;
  verdict: 'ROBUST' | 'FRAGILE' | 'FALSIFIED';
}> = [
  { regime: 'LOW_VOL_TREND', bars: 284, grossSharpe: 2.14, baseMaxDdPct: 4.8, turnoverRate: 0.22, volatility: 0.018, simPrice: 61800, verdict: 'ROBUST' },
  { regime: 'HIGH_VOL_BREAKOUT', bars: 196, grossSharpe: 1.86, baseMaxDdPct: 7.4, turnoverRate: 0.35, volatility: 0.032, simPrice: 60400, verdict: 'ROBUST' },
  { regime: 'HIGH_VOL_CHOP', bars: 168, grossSharpe: 0.62, baseMaxDdPct: 12.6, turnoverRate: 0.61, volatility: 0.048, simPrice: 62900, verdict: 'FRAGILE' },
  { regime: 'LIQUIDITY_CRISIS', bars: 82, grossSharpe: -0.18, baseMaxDdPct: 18.9, turnoverRate: 0.84, volatility: 0.075, simPrice: 58200, verdict: 'FALSIFIED' },
];

export const CANDIDATE_TRIALS = [
  { hypothesisId: 'HYP-ZOO-001', family: 'CROSS_SECTIONAL_MOM', rawPValue: 0.004, observedSharpe: 2.18 },
  { hypothesisId: 'HYP-ZOO-004', family: 'VOL_ADJUSTED_DCA', rawPValue: 0.011, observedSharpe: 1.92 },
  { hypothesisId: 'HYP-ZOO-007', family: 'OFI_MICRO_REVERSION', rawPValue: 0.024, observedSharpe: 1.54 },
  { hypothesisId: 'HYP-ZOO-009', family: 'FUNDING_BASIS_CARRY', rawPValue: 0.048, observedSharpe: 1.21 },
  { hypothesisId: 'HYP-ZOO-012', family: 'ILLIQUIDITY_SHOCK', rawPValue: 0.089, observedSharpe: 0.84 },
] as const;

export const ASSET_RETURN_VECTORS: Record<string, number[]> = {
  BTC: [0.012, -0.008, 0.021, 0.005, -0.014, 0.018, 0.009, -0.004, 0.015, 0.011],
  ETH: [0.014, -0.009, 0.019, 0.007, -0.012, 0.016, 0.011, -0.003, 0.014, 0.009],
  SOL: [0.022, -0.015, 0.031, 0.002, -0.024, 0.027, 0.014, -0.011, 0.025, 0.017],
  BNB: [0.008, -0.004, 0.011, 0.004, -0.007, 0.009, 0.006, -0.001, 0.008, 0.005],
};
