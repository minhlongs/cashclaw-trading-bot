import type { RfqQuoteRequest, RfqMatchFill } from './rfq-darkmesh-types';

export class RfqFillMatcher {
  public static pairFills(
    buys: Array<{ rfq: RfqQuoteRequest; targetFill: number }>,
    sells: Array<{ rfq: RfqQuoteRequest; targetFill: number }>,
    symbol: string, midPrice: number, now: number, feeRate: number
  ): RfqMatchFill[] {
    const fills: RfqMatchFill[] = [];
    let b = 0, s = 0, counter = 1;
    while (b < buys.length && s < sells.length) {
      const matchQty = Math.min(buys[b].targetFill, sells[s].targetFill);
      if (matchQty > 1e-9) {
        const notional = matchQty * midPrice;
        fills.push({
          matchId: `rfq-match-${symbol}-${now}-${counter++}`, symbol,
          buyRfqId: buys[b].rfq.rfqId, sellRfqId: sells[s].rfq.rfqId,
          buyBotId: buys[b].rfq.botId, sellBotId: sells[s].rfq.botId,
          matchedQuantity: matchQty, settlementPrice: midPrice, notionalValue: notional,
          feeSavedUsd: notional * (feeRate * 2), timestamp: now,
        });
        buys[b].targetFill -= matchQty;
        sells[s].targetFill -= matchQty;
      }
      if (buys[b].targetFill <= 1e-9) b++;
      if (sells[s].targetFill <= 1e-9) s++;
    }
    return fills;
  }
}
