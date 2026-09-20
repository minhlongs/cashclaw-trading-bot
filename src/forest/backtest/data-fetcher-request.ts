// Request builder for public exchange kline endpoints.
// Returns a fully-formed URL + parser pair for the requested exchange.

import type { Candle } from './ohlcv';
import { parseBinance, parseBybit, parseOkx } from './data-fetcher-parsers';

const KLINE_LIMIT = 1000;

export function buildRequestCapped(
  exchange: string,
  symbol: string,
  interval: string,
  endMs: number,
): { url: string; parse: (data: unknown) => Candle[] } {
  switch (exchange) {
    case 'binance': {
      const s = encodeURIComponent(symbol.replace('/', ''));
      return {
        url: `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${interval}&endTime=${endMs}&limit=${KLINE_LIMIT}`,
        parse: parseBinance,
      };
    }
    case 'bybit': {
      const s = encodeURIComponent(symbol.replace('/', ''));
      return {
        url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=${interval}&end=${endMs}&limit=${KLINE_LIMIT}`,
        parse: parseBybit,
      };
    }
    case 'okx': {
      const s = encodeURIComponent(symbol.replace('/', '-'));
      return {
        url: `https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=${interval}&after=${endMs}&limit=${KLINE_LIMIT}`,
        parse: parseOkx,
      };
    }
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}
