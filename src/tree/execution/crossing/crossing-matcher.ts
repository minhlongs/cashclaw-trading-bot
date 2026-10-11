import type { InternalOrder, InternalFill } from './internal-crossing-types';

export function executePairMatching(
  buys: InternalOrder[], sells: InternalOrder[], symbol: string, midPrice: number, takerFeeRate: number, nowTimestamp: number,
): InternalFill[] {
  const fills: InternalFill[] = [];
  let buyIdx = 0, sellIdx = 0, matchCounter = 1;
  while (buyIdx < buys.length && sellIdx < sells.length) {
    const buy = buys[buyIdx], sell = sells[sellIdx];
    const matchQty = Math.min(buy.quantity, sell.quantity);
    if (matchQty > 0) {
      const notional = matchQty * midPrice;
      fills.push({
        matchId: `cross-${symbol}-${nowTimestamp}-${matchCounter++}`,
        symbol, buyOrderId: buy.orderId, sellOrderId: sell.orderId,
        buyBotId: buy.botId, sellBotId: sell.botId, matchedQuantity: matchQty,
        executionPrice: midPrice, notionalValue: notional,
        feeSavedUsd: notional * (takerFeeRate * 2), timestamp: nowTimestamp,
      });
      buys[buyIdx] = { ...buy, quantity: buy.quantity - matchQty };
      sells[sellIdx] = { ...sell, quantity: sell.quantity - matchQty };
    }
    if (buys[buyIdx].quantity <= 1e-9) buyIdx++;
    if (sells[sellIdx].quantity <= 1e-9) sellIdx++;
  }
  return fills;
}
