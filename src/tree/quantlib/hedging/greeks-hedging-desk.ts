import type {
  PortfolioGreeks,
  GreeksRiskLimits,
  RebalanceHedgeOrder,
  GreeksHedgingResult,
} from './greeks-hedging-types';

export class GreeksHedgingDesk {
  private readonly limits: GreeksRiskLimits;

  constructor(limits?: Partial<GreeksRiskLimits>) {
    this.limits = {
      maxDeltaExposure: limits?.maxDeltaExposure ?? 5.0,
      maxGammaExposure: limits?.maxGammaExposure ?? 2.0,
      maxVegaExposure: limits?.maxVegaExposure ?? 500.0,
    };
  }

  evaluateAndHedge(greeks: PortfolioGreeks): GreeksHedgingResult {
    const orders: RebalanceHedgeOrder[] = [];
    let isBreached = false;

    // Delta hedging via linear perp
    if (Math.abs(greeks.delta) > this.limits.maxDeltaExposure) {
      isBreached = true;
      const excess = greeks.delta;
      orders.push({
        instrument: 'PERP_UNDERLYING',
        action: excess > 0 ? 'SELL' : 'BUY',
        quantity: Number(Math.abs(excess).toFixed(4)),
        rationale: `Delta exposure ${greeks.delta} breached limit +/-${this.limits.maxDeltaExposure}`,
      });
    }

    // Vega hedging via option straddle
    if (Math.abs(greeks.vega) > this.limits.maxVegaExposure) {
      isBreached = true;
      const excess = greeks.vega;
      orders.push({
        instrument: 'OPTION_STRADDLE',
        action: excess > 0 ? 'SELL' : 'BUY',
        quantity: Number((Math.abs(excess) / 50).toFixed(4)),
        rationale: `Vega exposure ${greeks.vega} breached limit +/-${this.limits.maxVegaExposure}`,
      });
    }

    return {
      currentGreeks: greeks,
      isBreached,
      rebalanceOrders: orders,
    };
  }
}
