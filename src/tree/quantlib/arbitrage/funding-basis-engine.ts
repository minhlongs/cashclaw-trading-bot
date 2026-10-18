// Multi-Venue Perpetual Funding Rate Basis Arbitrage Engine
import type {
  VenueFundingQuote, FundingBasisOpportunity, FundingBasisConfig, BasisArbitrageStatus,
} from './funding-basis-types';

export class FundingBasisEngine {
  private readonly config: Required<FundingBasisConfig>;

  constructor(config: FundingBasisConfig = {}) {
    this.config = {
      minHurdleRateAnnual: config.minHurdleRateAnnual ?? 0.08,
      minLiquidationDistance: config.minLiquidationDistance ?? 0.2,
      defaultHoldingDays: config.defaultHoldingDays ?? 30,
      annualBorrowRate: config.annualBorrowRate ?? 0.02,
      defaultLeverage: config.defaultLeverage ?? 3,
      maintenanceMarginRatio: config.maintenanceMarginRatio ?? 0.05,
    };
  }

  annualizeFundingRate(rate: number, intervalHours: number): number {
    if (intervalHours <= 0 || !Number.isFinite(intervalHours)) {
      throw new Error('Funding interval must be positive and finite.');
    }
    return rate * (24 / intervalHours) * 365;
  }

  private calculateLiquidationDistance(quote: VenueFundingQuote, isShort: boolean): number {
    if (quote.liquidationPrice && quote.markPrice > 0) {
      return isShort
        ? Math.max(0, (quote.liquidationPrice - quote.markPrice) / quote.markPrice)
        : Math.max(0, (quote.markPrice - quote.liquidationPrice) / quote.markPrice);
    }
    return Math.max(0, 1 / this.config.defaultLeverage - this.config.maintenanceMarginRatio);
  }

  private resolveStatus(netYield: number, liqDist: number): BasisArbitrageStatus {
    if (liqDist < this.config.minLiquidationDistance) return 'REJECT';
    if (netYield >= this.config.minHurdleRateAnnual) return 'EXECUTE';
    if (netYield >= 0) return 'HOLD';
    return 'UNWIND';
  }

  evaluatePair(
    shortQuote: VenueFundingQuote,
    longQuote: VenueFundingQuote,
    holdingDays = this.config.defaultHoldingDays,
  ): FundingBasisOpportunity {
    if (shortQuote.markPrice <= 0 || longQuote.markPrice <= 0) {
      throw new Error('Mark prices must be positive.');
    }
    const days = Math.max(1, holdingDays);
    const shortAnnual = this.annualizeFundingRate(shortQuote.fundingRate, shortQuote.fundingIntervalHours);
    const longAnnual = this.annualizeFundingRate(longQuote.fundingRate, longQuote.fundingIntervalHours);
    const grossAnnualYield = shortAnnual - longAnnual;

    // Roundtrip taker fee for both sides entering and exiting
    const totalTakerFeeRate = 2 * (shortQuote.takerFeeRate + longQuote.takerFeeRate);
    const takerFeeAnnualDrag = totalTakerFeeRate / (days / 365);
    const netAnnualYield = grossAnnualYield - takerFeeAnnualDrag - this.config.annualBorrowRate;

    const shortLiqDist = this.calculateLiquidationDistance(shortQuote, true);
    const longLiqDist = this.calculateLiquidationDistance(longQuote, false);
    const minLiquidationDistance = Math.min(shortLiqDist, longLiqDist);
    const status = this.resolveStatus(netAnnualYield, minLiquidationDistance);

    return {
      shortVenueId: shortQuote.venueId, longVenueId: longQuote.venueId, symbol: shortQuote.symbol,
      grossAnnualYield, netAnnualYield, holdingDays: days,
      takerFeeAnnualDrag, annualBorrowCost: this.config.annualBorrowRate,
      minLiquidationDistance, status, hurdleRateAnnual: this.config.minHurdleRateAnnual,
    };
  }

  findBestOpportunity(quotes: readonly VenueFundingQuote[], holdingDays?: number): FundingBasisOpportunity | null {
    if (quotes.length < 2) return null;
    let bestOpp: FundingBasisOpportunity | null = null;

    for (let i = 0; i < quotes.length; i++) {
      for (let j = 0; j < quotes.length; j++) {
        if (i === j) continue;
        const opp = this.evaluatePair(quotes[i], quotes[j], holdingDays);
        if (!bestOpp || opp.netAnnualYield > bestOpp.netAnnualYield) {
          bestOpp = opp;
        }
      }
    }
    return bestOpp;
  }
}
