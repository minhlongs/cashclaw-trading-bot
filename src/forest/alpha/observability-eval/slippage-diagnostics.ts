import { resolveStressConfig, type StressMode } from '../../../tree/alpha/cost-stress';
import type { ShadowFill, ShadowOrder } from '../../../tree/alpha/observability/types';
import type {
  SlippageAttributionSection,
  StressTierAttribution,
} from './types';
import {
  round4,
  ALL_STRESS_TIERS,
  computeTierAttribution,
  computeSideAttribution,
} from './slippage-diagnostics-attributions';

export { ALL_STRESS_TIERS, computeTierAttribution, computeSideAttribution };

export function computeSlippageDiagnostics(
  shadowOrders: readonly ShadowOrder[],
  shadowFills: readonly ShadowFill[],
): SlippageAttributionSection {
  const fillCount = shadowFills.length;
  const byStressTier: Record<string, StressTierAttribution> = {};

  for (const tier of ALL_STRESS_TIERS) {
    byStressTier[tier] = computeTierAttribution(tier, shadowFills);
  }

  const bySide = {
    buy: computeSideAttribution('buy', shadowOrders, shadowFills),
    sell: computeSideAttribution('sell', shadowOrders, shadowFills),
  };

  if (fillCount === 0) {
    return {
      expectedSlippageBpsMean: 0,
      realizedSlippageBpsMean: 0,
      slippageDeltaBpsMean: 0,
      totalFees: 0,
      effectiveCostBps: 0,
      byStressTier,
      bySide,
    };
  }

  let totalExp = 0;
  let totalReal = 0;
  let totalFees = 0;
  let totalNotional = 0;

  for (const f of shadowFills) {
    const expBps = resolveStressConfig(f.stressTier as StressMode).slipPct * 10_000;
    totalExp += expBps;
    totalReal += f.slippageBps;
    totalFees += f.feeAmount;
    totalNotional += f.fillPrice * f.fillQuantity;
  }

  const expMean = round4(totalExp / fillCount);
  const realMean = round4(totalReal / fillCount);
  const feeComponentBps = totalNotional > 0 ? (totalFees / totalNotional) * 10_000 : 0;

  return {
    expectedSlippageBpsMean: expMean,
    realizedSlippageBpsMean: realMean,
    slippageDeltaBpsMean: round4(realMean - expMean),
    totalFees: round4(totalFees),
    effectiveCostBps: round4(realMean + feeComponentBps),
    byStressTier,
    bySide,
  };
}
