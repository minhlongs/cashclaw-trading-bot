// Pure data mapping helpers for transforming CCXT responses into CashClaw internal types.

import type { Order as CCXTOrder, Ticker as CCXTTicker, OrderBook as CCXTOrderBook, Balances as CCXTBalances } from 'ccxt';
import type {
  CCXTTickerResult,
  CCXTOrderBookResult,
  CCXTBalanceResult,
  CCXTOrderResult,
  CCXTOrderRequest,
} from './client-types';

const STATUS_MAP: Record<string, string> = {
  open: 'open',
  closed: 'filled',
  partially_filled: 'partially_filled',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  rejected: 'rejected',
  expired: 'expired',
};

/**
 * Normalizes raw CCXT status string to standard internal status.
 */
export function mapCCXTStatus(rawStatus?: string): string {
  return STATUS_MAP[rawStatus ?? ''] ?? 'open';
}

/**
 * Maps CCXT ticker object to normalized CCXTTickerResult.
 */
export function mapCCXTTicker(ticker: CCXTTicker, symbol: string): CCXTTickerResult {
  return {
    symbol,
    last: ticker.last ?? 0,
    bid: ticker.bid ?? 0,
    ask: ticker.ask ?? 0,
    high24h: ticker.high ?? 0,
    low24h: ticker.low ?? 0,
    volume24h: ticker.baseVolume ?? 0,
    timestamp: ticker.timestamp ?? Date.now(),
  };
}

/**
 * Maps CCXT order book to normalized CCXTOrderBookResult.
 */
export function mapCCXTOrderBook(book: CCXTOrderBook, symbol: string): CCXTOrderBookResult {
  return {
    symbol,
    bids: (book.bids ?? []).map(([price, qty]) => ({ price: price ?? 0, quantity: qty ?? 0 })),
    asks: (book.asks ?? []).map(([price, qty]) => ({ price: price ?? 0, quantity: qty ?? 0 })),
    timestamp: book.timestamp ?? Date.now(),
  };
}

type RawBalanceMap = Record<string, number | undefined>;

function toBalanceMap(value: unknown): RawBalanceMap {
  if (value && typeof value === 'object') {
    return value as RawBalanceMap;
  }
  return {};
}

/**
 * Maps CCXT raw balance structure to an array of CCXTBalanceResult entries.
 */
export function mapCCXTBalances(raw: CCXTBalances): CCXTBalanceResult[] {
  const balances: CCXTBalanceResult[] = [];
  const freeMap = toBalanceMap(raw.free);
  const usedMap = toBalanceMap(raw.used);
  const totalMap = toBalanceMap(raw.total);

  for (const [currency, totalVal] of Object.entries(totalMap)) {
    const total = Number(totalVal) || 0;
    if (total <= 0) continue;
    const free = Number(freeMap[currency] ?? 0);
    const used = Number(usedMap[currency] ?? 0);
    balances.push({ currency, free, used, total });
  }
  return balances;
}

function mapFee(raw: CCXTOrder): { fee?: number; feeCurrency?: string } {
  if (!raw.fee) return {};
  return {
    fee: Number(raw.fee.cost ?? 0),
    feeCurrency: String(raw.fee.currency) || undefined,
  };
}

/**
 * Maps CCXT order object to normalized CCXTOrderResult.
 */
export function mapCCXTOrder(
  raw: CCXTOrder,
  exchange: string,
  request?: CCXTOrderRequest,
): CCXTOrderResult {
  return {
    id: String(raw.id),
    exchangeId: exchange,
    symbol: raw.symbol ?? request?.symbol ?? '',
    side: request?.side ?? String(raw.side ?? ''),
    type: request?.type ?? String(raw.type ?? ''),
    price: Number(raw.price ?? request?.price ?? 0),
    quantity: request?.quantity ?? Number(raw.amount ?? 0),
    filled: Number(raw.filled ?? 0),
    status: mapCCXTStatus(raw.status),
    ...mapFee(raw),
    timestamp: Number(raw.timestamp ?? Date.now()),
    pnl: 0,
  };
}
