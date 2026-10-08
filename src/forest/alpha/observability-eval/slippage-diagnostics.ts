import { resolveStressConfig, type StressMode } from '../../../tree/alpha/cost-stress';
import type { CostStressTier, ShadowFill, ShadowOrder } from '../../../tree/alpha/observability/types';
import type {
  SlippageAttributionSection,
  StressTierAttribution,
} from './types';

const round4 = (v: number): number => Number(v.toFixed(4));
const ALL_STRESS_TIERS: readonly CostStressTier[] = [
  'normal',
  'conservative',
  'adverse',
  'extreme',
];

function computeTierAttribution(
  tier: CostStressTier,
  fills: readonly ShadowFill[],
): StressTierAttribution {
  const tierFills = fills.filter((f) => f.stressTier === tier);
  const fillCount = tierFills.length;
  const orderIdSet = new Set(tierFills.map((f) => f.orderId));
  const orderCount = orderIdSet.size;
  const fillRate = orderCount > 0 ? Math.min(1, round4(fillCount / orderCount)) : (fillCount > 0 ? 1 : 0);

  const baselineExpBps = round4(resolveStressConfig(tier as StressMode).slipPct * 10_000);
  if (fillCount === 0) {
    return {
      stressTier: tier,
      orderCount,
      fillCount: 0,
      fillRate,
      expectedSlippageBpsMean: baselineExpBps,
      realizedSlippageBpsMean: 0,
      slippageDeltaBpsMean: round4(0 - baselineExpBps),
      totalFees: 0,
    };
  }

  const expSum = tierFills.reduce(
    (sum, f) => sum + resolveStressConfig(f.stressTier as StressMode).slipPct * 10_000,
    0,
  );
  const realSum = tierFills.reduce((sum, f) => sum + f.slippageBps, 0);
  const feeSum = tierFills.reduce((sum, f) => sum + f.feeAmount, 0);

  const expMean = round4(expSum / fillCount);
  const realMean = round4(realSum / fillCount);

  return {
    stressTier: tier,
    orderCount: Math.max(orderCount, fillCount),
    fillCount,
    fillRate: 1,
    expectedSlippageBpsMean: expMean,
    realizedSlippageBpsMean: realMean,
    slippageDeltaBpsMean: round4(realMean - expMean),
    totalFees: round4(feeSum),
  };
}

function computeSideAttribution(
  side: 'buy' | 'sell',
  orders: readonly ShadowOrder[],
  fills: readonly ShadowFill[],
) {
  const sideOrders = orders.filter((o) => o.side === side);
  const sideFills = fills.filter((f) => f.side === side);
  const fillCount = sideFills.length;
  const realSum = sideFills.reduce((sum, f) => sum + f.slippageBps, 0);

  return {
    orderCount: sideOrders.length,
    fillCount,
    realizedSlippageBpsMean: fillCount > 0 ? round4(realSum / fillCount) : 0,
  };
}

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
  const deltaMean = round4(realMean - expMean);
  const feeComponentBps = totalNotional > 0 ? (totalFees / totalNotional) * 10_000 : 0;
  const effectiveCostBps = round4(realMean + feeComponentBps);

  return {
    expectedSlippageBpsMean: expMean,
    realizedSlippageBpsMean: realMean,
    slippageDeltaBpsMean: deltaMean,
    totalFees: round4(totalFees),
    effectiveCostBps,
    byStressTier,
    bySide,
  };
}
