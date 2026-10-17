// Pure domain model and stress calculations for RegimeAttributionSimulator
// Extracted to keep UI components focused and <= 135 LOC.

export type RegimeId = 'LOW_VOL_TREND' | 'HIGH_VOL_BREAKOUT' | 'HIGH_VOL_CHOP' | 'LIQUIDITY_CRISIS';
export type CostTierId = 'BASE' | 'ELEVATED' | 'EXTREME';

export interface RegimeRow {
  readonly regime: RegimeId;
  readonly bars: number;
  readonly grossSharpe: number;
  readonly baseMaxDdPct: number;
  readonly turnoverRate: number;
  readonly verdict: 'ROBUST' | 'FRAGILE' | 'FALSIFIED';
}

export interface StressedRegimeRow extends RegimeRow {
  readonly netSharpe: number;
  readonly stressedDdPct: number;
}

export interface CostTierSpec {
  readonly label: string;
  readonly bps: number;
  readonly penaltySharpe: number;
  readonly ddMultiplier: number;
}

export const COST_TIERS: Record<CostTierId, CostTierSpec> = {
  BASE: { label: 'BASE (10 bps)', bps: 10, penaltySharpe: 0, ddMultiplier: 1.0 },
  ELEVATED: { label: 'ELEVATED (20 bps)', bps: 20, penaltySharpe: 0.32, ddMultiplier: 1.18 },
  EXTREME: { label: 'EXTREME (35 bps)', bps: 35, penaltySharpe: 0.74, ddMultiplier: 1.42 },
};

export const REGIME_DATA: readonly RegimeRow[] = [
  { regime: 'LOW_VOL_TREND', bars: 284, grossSharpe: 2.14, baseMaxDdPct: 4.8, turnoverRate: 0.22, verdict: 'ROBUST' },
  { regime: 'HIGH_VOL_BREAKOUT', bars: 196, grossSharpe: 1.86, baseMaxDdPct: 7.4, turnoverRate: 0.35, verdict: 'ROBUST' },
  { regime: 'HIGH_VOL_CHOP', bars: 168, grossSharpe: 0.62, baseMaxDdPct: 12.6, turnoverRate: 0.61, verdict: 'FRAGILE' },
  { regime: 'LIQUIDITY_CRISIS', bars: 82, grossSharpe: -0.18, baseMaxDdPct: 18.9, turnoverRate: 0.84, verdict: 'FALSIFIED' },
];

export function computeStressedRegimeRows(
  selectedRegime: 'ALL' | RegimeId,
  tierSpec: CostTierSpec,
): readonly StressedRegimeRow[] {
  const filtered =
    selectedRegime === 'ALL'
      ? REGIME_DATA
      : REGIME_DATA.filter((r) => r.regime === selectedRegime);

  return filtered.map((row) => {
    const netSharpe = Number(
      (row.grossSharpe - tierSpec.penaltySharpe * (0.7 + row.turnoverRate)).toFixed(2),
    );
    const stressedDdPct = Number((row.baseMaxDdPct * tierSpec.ddMultiplier).toFixed(1));
    return { ...row, netSharpe, stressedDdPct };
  });
}
