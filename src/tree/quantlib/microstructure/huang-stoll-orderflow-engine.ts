export function computeHuangStollOrderFlow(p: HuangStollOrderFlowParams): HuangStollOrderFlowResult {
  const prices = p.prices, n = prices.length;
  if (n < 3) return { effectiveSpread: 0, adverseSelectionRatio: 0, inventoryHoldingRatio: 0, orderProcessingRatio: 1, tradeAutocorrelation: 0, sampleSize: 0 };
  const signs: number[] = [];
  for (let i = 0; i < n; i++) {
    const q = p.tradeSigns?.[i] ?? (i === 0 ? 1 : prices[i]! > prices[i - 1]! ? 1 : prices[i]! < prices[i - 1]! ? -1 : signs[i - 1] ?? 1);
    signs.push(q);
  }
  let sumDpQ = 0, sumDpPrevQ = 0, sumQQprev = 0, count = 0;
  for (let t = 1; t < n; t++) {
    const dp = prices[t]! - prices[t - 1]!, q = signs[t]!, prevQ = signs[t - 1]!;
    sumDpQ += dp * q; sumDpPrevQ += dp * prevQ; sumQQprev += q * prevQ; count++;
  }
  const meanSpread = count > 0 ? (2 * Math.abs(sumDpQ)) / count : 0;
  const rho = count > 0 ? sumQQprev / count : 0;
  const rawAlpha = sumDpQ !== 0 ? Math.min(1, Math.max(0, 1 - Math.abs(sumDpPrevQ / sumDpQ))) : 0.3;
  const rawBeta = Math.min(1 - rawAlpha, Math.max(0, (1 - Math.abs(rho)) * 0.3));
  const rawGamma = Math.max(0, 1 - rawAlpha - rawBeta);
  const total = rawAlpha + rawBeta + rawGamma || 1;
  return {
    effectiveSpread: meanSpread,
    adverseSelectionRatio: rawAlpha / total,
    inventoryHoldingRatio: rawBeta / total,
    orderProcessingRatio: rawGamma / total,
    tradeAutocorrelation: rho,
    sampleSize: count,
  };
}

export interface HuangStollOrderFlowParams {
  readonly prices: readonly number[];
  readonly tradeSigns?: readonly number[]; // +1 buy, -1 sell (auto-inferred if omitted)
  readonly lag?: number; // default 1
}

export interface HuangStollOrderFlowResult {
  readonly effectiveSpread: number;
  readonly adverseSelectionRatio: number; // alpha in [0, 1]
  readonly inventoryHoldingRatio: number; // beta in [0, 1]
  readonly orderProcessingRatio: number; // 1 - alpha - beta in [0, 1]
  readonly tradeAutocorrelation: number;
  readonly sampleSize: number;
}
