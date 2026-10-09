import type { Ticker } from '../types';
import type { OkxTicker, BybitTicker } from './types';
import { toCanonicalSymbol } from './symbol-normalizer';
import { validatePositiveFinite } from './ticker-normalizer-binance';

export function normalizeOkxTicker(raw: OkxTicker, canonicalSymbol?: string): Ticker {
  if (!raw || typeof raw !== 'object') throw new Error('Raw OKX ticker payload must be a non-null object');
  const symbol = canonicalSymbol ? toCanonicalSymbol(canonicalSymbol) : toCanonicalSymbol(raw.instId);
  const parsedTs = parseInt(raw.ts, 10);
  if (!Number.isFinite(parsedTs) || parsedTs <= 0) throw new Error(`Invalid timestamp in OKX ticker: received ${String(raw.ts)}`);
  return {
    symbol,
    last: validatePositiveFinite(raw.last, 'last'),
    bid: validatePositiveFinite(raw.bidPx, 'bidPx'),
    ask: validatePositiveFinite(raw.askPx, 'askPx'),
    high24h: validatePositiveFinite(raw.high24h, 'high24h'),
    low24h: validatePositiveFinite(raw.low24h, 'low24h'),
    volume24h: validatePositiveFinite(raw.vol24h, 'vol24h'),
    timestamp: parsedTs,
  };
}

export function normalizeBybitTicker(raw: BybitTicker, canonicalSymbol?: string, timestamp?: number): Ticker {
  if (!raw || typeof raw !== 'object') throw new Error('Raw Bybit ticker payload must be a non-null object');
  const symbol = canonicalSymbol ? toCanonicalSymbol(canonicalSymbol) : toCanonicalSymbol(raw.symbol);
  let finalTimestamp = Date.now();
  if (timestamp !== undefined) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error(`Invalid timestamp in Bybit ticker: received ${String(timestamp)}`);
    finalTimestamp = timestamp;
  }
  return {
    symbol,
    last: validatePositiveFinite(raw.lastPrice, 'lastPrice'),
    bid: validatePositiveFinite(raw.bid1Price, 'bid1Price'),
    ask: validatePositiveFinite(raw.ask1Price, 'ask1Price'),
    high24h: validatePositiveFinite(raw.highPrice24h, 'highPrice24h'),
    low24h: validatePositiveFinite(raw.lowPrice24h, 'lowPrice24h'),
    volume24h: validatePositiveFinite(raw.volume24h, 'volume24h'),
    timestamp: finalTimestamp,
  };
}
