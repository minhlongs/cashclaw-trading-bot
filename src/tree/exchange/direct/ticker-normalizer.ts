import type { ExchangeId, Ticker } from '../types';
import type { Binance24hrTicker, OkxTicker, BybitTicker } from './types';
import { validatePositiveFinite, normalizeBinanceTicker } from './ticker-normalizer-binance';
import { normalizeOkxTicker, normalizeBybitTicker } from './ticker-normalizer-exchanges';

export { validatePositiveFinite, normalizeBinanceTicker, normalizeOkxTicker, normalizeBybitTicker };

export function normalizeTicker(exchangeId: ExchangeId, raw: unknown, canonicalSymbol?: string): Ticker {
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
