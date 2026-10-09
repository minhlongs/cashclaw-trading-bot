import type { RebalanceRecord } from '@/tree/alpha/cross-sectional/types';
import { resolveStressConfig, type StressMode } from '@/forest/backtest/cost-model';

export interface CostAttributionResult {
  readonly fees: number;
  readonly slippage: number;
  readonly marketImpact: number;
}

export function attributeCosts(periods: readonly RebalanceRecord[], mode: StressMode = 'conservative'): CostAttributionResult {
  const stress = resolveStressConfig(mode);
  const totalUnitCost = stress.feePct + stress.slipPct + stress.marketImpactPct;
  if (totalUnitCost === 0) return { fees: 0, slippage: 0, marketImpact: 0 };

  const feeShare = stress.feePct / totalUnitCost;
  const slipShare = stress.slipPct / totalUnitCost;
  const impactShare = stress.marketImpactPct / totalUnitCost;

  let fees = 0, slippage = 0, marketImpact = 0;
  for (const p of periods) {
    fees += p.costPct * feeShare;
    slippage += p.costPct * slipShare;
    marketImpact += p.costPct * impactShare;
  }
  return { fees, slippage, marketImpact };
}
