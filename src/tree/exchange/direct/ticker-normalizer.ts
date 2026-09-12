// Ticker Normalizer for Direct REST Engine
// Normalizes heterogeneous exchange payloads to canonical Ticker domain model

import type { ExchangeId, Ticker } from '../types';
import type { Binance24hrTicker, OkxTicker, BybitTicker } from './types';
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

export function normalizeBinanceTicker(
  raw: Binance24hrTicker,
  canonicalSymbol?: string
): Ticker {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw Binance ticker payload must be a non-null object');
  }

  const symbol = canonicalSymbol
    ? toCanonicalSymbol(canonicalSymbol)
    : toCanonicalSymbol(raw.symbol);

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

export function normalizeOkxTicker(
  raw: OkxTicker,
  canonicalSymbol?: string
): Ticker {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw OKX ticker payload must be a non-null object');
  }

  const symbol = canonicalSymbol
    ? toCanonicalSymbol(canonicalSymbol)
    : toCanonicalSymbol(raw.instId);

  const parsedTs = parseInt(raw.ts, 10);
  if (!Number.isFinite(parsedTs) || parsedTs <= 0) {
    throw new Error(`Invalid timestamp in OKX ticker: received ${String(raw.ts)}`);
  }

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

export function normalizeBybitTicker(
  raw: BybitTicker,
  canonicalSymbol?: string,
  timestamp?: number
): Ticker {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Raw Bybit ticker payload must be a non-null object');
  }

  const symbol = canonicalSymbol
    ? toCanonicalSymbol(canonicalSymbol)
    : toCanonicalSymbol(raw.symbol);

  let finalTimestamp = Date.now();
  if (timestamp !== undefined) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      throw new Error(`Invalid timestamp in Bybit ticker: received ${String(timestamp)}`);
    }
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

export function normalizeTicker(
  exchangeId: ExchangeId,
  raw: unknown,
  canonicalSymbol?: string
): Ticker {
  switch (exchangeId) {
    case 'binance':
      return normalizeBinanceTicker(raw as Binance24hrTicker, canonicalSymbol);
    case 'okx':
      return normalizeOkxTicker(raw as OkxTicker, canonicalSymbol);
    case 'bybit':
      return normalizeBybitTicker(raw as BybitTicker, canonicalSymbol);
    default:
      throw new Error(`Unsupported exchange ID: ${String(exchangeId)}`);
  }
}
