// Multi-Venue Funding Rate Monitor Service
// Ingests, normalizes, and identifies cross-venue carry opportunities

import type { ExchangeId } from '../types';
import type { FundingRateRecord, ArbitrageOpportunity } from './funding-types';
import { evaluateArbitrageOpportunity } from './basis-calculator';

export class FundingRateMonitor {
  private readonly records = new Map<string, Map<ExchangeId, FundingRateRecord>>();

  public recordRate(rateRecord: FundingRateRecord): void {
    if (!this.records.has(rateRecord.symbol)) {
      this.records.set(rateRecord.symbol, new Map());
    }
    const symbolMap = this.records.get(rateRecord.symbol);
    if (symbolMap) {
      symbolMap.set(rateRecord.exchange, rateRecord);
    }
  }

  public getRate(symbol: string, exchange: ExchangeId): FundingRateRecord | null {
    return this.records.get(symbol)?.get(exchange) ?? null;
  }

  public scanOpportunities(symbol: string): ArbitrageOpportunity[] {
    const symbolMap = this.records.get(symbol);
    if (!symbolMap || symbolMap.size < 2) return [];

    const venues = Array.from(symbolMap.values());
    const opportunities: ArbitrageOpportunity[] = [];

    for (let i = 0; i < venues.length; i++) {
      for (let j = i + 1; j < venues.length; j++) {
        const opp = evaluateArbitrageOpportunity(venues[i], venues[j]);
        if (opp.isViable) {
          opportunities.push(opp);
        }
      }
    }

    return opportunities.sort((a, b) => b.annualizedNetYield - a.annualizedNetYield);
  }

  public clear(): void {
    this.records.clear();
  }
}
