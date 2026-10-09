import type { Ticker } from '../types';
import type { Binance24hrTicker } from './types';
import { toCanonicalSymbol } from './symbol-normalizer';

export function validatePositiveFinite(val: unknown, fieldName: string): number {
  if (val === undefined || val === null || val === '') {
    throw new Error(`Missing or empty value for field: ${fieldName}`);
  }
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid non-negative number for ${fieldName}: received ${String(val)}`);
  }
  return num;
}

export function normalizeBinanceTicker(raw: Binance24hrTicker, canonicalSymbol?: string): Ticker {
  if (!raw || typeof raw !== 'object') throw new Error('Raw Binance ticker payload must be a non-null object');
  const symbol = canonicalSymbol ? toCanonicalSymbol(canonicalSymbol) : toCanonicalSymbol(raw.symbol);
  let timestamp = Date.now();
  if (raw.closeTime !== undefined) {
    if (typeof raw.closeTime !== 'number' || !Number.isFinite(raw.closeTime) || raw.closeTime <= 0) {
      throw new Error(`Invalid closeTime in Binance ticker: received ${String(raw.closeTime)}`);
    }
    timestamp = raw.closeTime;
  }
  return {
    symbol,
    last: validatePositiveFinite(raw.lastPrice, 'lastPrice'),
    bid: validatePositiveFinite(raw.bidPrice, 'bidPrice'),
    ask: validatePositiveFinite(raw.askPrice, 'askPrice'),
    high24h: validatePositiveFinite(raw.highPrice, 'highPrice'),
    low24h: validatePositiveFinite(raw.lowPrice, 'lowPrice'),
    volume24h: validatePositiveFinite(raw.volume, 'volume'),
    timestamp,
  };
}
