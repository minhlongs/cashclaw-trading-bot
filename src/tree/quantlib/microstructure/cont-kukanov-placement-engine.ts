import type {
  ContKukanovPlacementConfig,
  ContKukanovPlacementResult,
} from './cont-kukanov-placement-types';

export class ContKukanovPlacementEngine {
  private readonly spread: number;
  private readonly limitFee: number;
  private readonly marketFee: number;
  private readonly adverseSelection: number;
  private readonly penalty: number;
  private readonly fillDecay: number;
  private readonly gridSteps: number;

  constructor(config: ContKukanovPlacementConfig) {
    this.spread = Math.max(1e-8, config.bidAskSpread);
    this.limitFee = config.limitOrderFeeRate ?? 0.0001;
    this.marketFee = config.marketOrderFeeRate ?? 0.0005;
    this.adverseSelection = config.adverseSelectionCost ?? 0.0002;
    this.penalty = config.nonExecutionPenalty ?? 0.0003;
    this.fillDecay = Math.max(1e-6, config.fillDecayRate ?? 0.05);
    this.gridSteps = Math.max(10, config.numGridSteps ?? 50);
  }

  getFillProbability(limitQuantity: number): number {
    return Math.exp(-this.fillDecay * Math.max(0, limitQuantity));
  }

  computeCost(limitQty: number, totalQty: number): number {
    const pFill = this.getFillProbability(limitQty);
    const limitCost =
      limitQty * pFill * (this.limitFee + this.adverseSelection - this.spread / 2);
    const unexecutedCost = limitQty * (1 - pFill) * (this.marketFee + this.penalty);
    const marketCost = (totalQty - limitQty) * this.marketFee;
    return limitCost + unexecutedCost + marketCost;
  }

  computeOptimalPlacement(orderQuantity: number): ContKukanovPlacementResult {
    const totalQty = Math.max(0, orderQuantity);
    if (totalQty === 0) {
      return {
        totalOrderQuantity: 0,
        optimalLimitQuantity: 0,
        optimalMarketQuantity: 0,
        limitRatio: 0,
        expectedCost: 0,
        expectedFillProbability: 1.0,
        makerSavingsBps: 0,
      };
    }

    let minCost = Infinity;
    let bestLimitQty = 0;

    for (let i = 0; i <= this.gridSteps; i++) {
      const candidateLimitQty = (i / this.gridSteps) * totalQty;
      const cost = this.computeCost(candidateLimitQty, totalQty);
      if (cost < minCost) {
        minCost = cost;
        bestLimitQty = candidateLimitQty;
      }
    }

    const optimalLimitQuantity = Number(bestLimitQty.toFixed(4));
    const optimalMarketQuantity = Number((totalQty - bestLimitQty).toFixed(4));
    const pFill = this.getFillProbability(optimalLimitQuantity);
    const pureMarketCost = totalQty * this.marketFee;
    const makerSavingsBps = Number(
      (((pureMarketCost - minCost) / Math.max(1e-8, pureMarketCost)) * 10_000).toFixed(2)
    );

    return {
      totalOrderQuantity: totalQty,
      optimalLimitQuantity,
      optimalMarketQuantity,
      limitRatio: Number((optimalLimitQuantity / totalQty).toFixed(4)),
      expectedCost: Number(minCost.toFixed(6)),
      expectedFillProbability: Number(pFill.toFixed(4)),
      makerSavingsBps,
    };
  }
}
