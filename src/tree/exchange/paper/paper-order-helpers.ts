// Paper Trading Adapter: order helper functions.
// Pure builders and mappers between simulated trades and domain order results.

import type {
  ExchangeId,
  OrderRequest,
  OrderResult,
} from '../types';
import type { PaperTrade } from './paper-types';

/**
 * Creates a new PaperTrade instance from an order request and sequential counter.
 */
export function createPaperTrade(
  counter: number,
  exchangeId: ExchangeId,
  request: OrderRequest,
): PaperTrade {
  const orderId = `paper_${counter}_${Date.now()}`;
  return {
    orderId,
    exchangeId,
    symbol: request.symbol,
    side: request.side,
    type: request.type,
    price: request.price ?? 0,
    quantity: request.quantity,
    filled: request.type === 'market' ? request.quantity : 0,
    status: request.type === 'market' ? 'filled' : 'open',
    fee: request.quantity * 0.001, // 0.1% simulated fee
    timestamp: Date.now(),
  };
}

/**
 * Maps a PaperTrade state model to an OrderResult domain contract.
 */
export function mapTradeToOrderResult(trade: PaperTrade): OrderResult {
  return {
    id: trade.orderId,
    exchangeId: trade.exchangeId,
    symbol: trade.symbol,
    side: trade.side,
    type: trade.type,
    price: trade.price,
    quantity: trade.quantity,
    filled: trade.filled,
    status: trade.status,
    fee: trade.fee,
    timestamp: trade.timestamp,
  };
}
