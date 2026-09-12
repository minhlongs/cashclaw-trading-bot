// Bidirectional Symbol Normalizer for Direct REST Engine
// Canonical format: BASE/QUOTE (e.g., BTC/USDT)
// Exchange native: Binance (BTCUSDT), OKX (BTC-USDT), Bybit (BTCUSDT)

import type { ExchangeId } from '../types';

export const COMMON_QUOTES = [
  'USDT',
  'USDC',
  'FDUSD',
  'BUSD',
  'TUSD',
  'EUR',
  'USD',
  'BTC',
  'ETH',
  'BNB',
  'DAI',
] as const;

export interface ParsedSymbol {
  base: string;
  quote: string;
}

export function parseSymbol(symbol: string): ParsedSymbol {
  if (typeof symbol !== 'string' || !symbol.trim()) {
    throw new Error('Symbol cannot be empty');
  }

  const s = symbol.trim().toUpperCase();

  const delimiters = ['/', '-', '_'] as const;
  const matchedDelimiters = delimiters.filter(d => s.includes(d));

  if (matchedDelimiters.length > 1) {
    throw new Error(`Malformed symbol with mixed delimiters: ${symbol}`);
  }

  if (matchedDelimiters.length === 1) {
    const delimiter = matchedDelimiters[0];
    const parts = s.split(delimiter);
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Malformed symbol structure: ${symbol}`);
    }
    return { base: parts[0], quote: parts[1] };
  }

  // Undivided symbol parsing (e.g. BTCUSDT)
  for (const quote of COMMON_QUOTES) {
    if (s.endsWith(quote) && s.length > quote.length) {
      const base = s.slice(0, s.length - quote.length);
      return { base, quote };
    }
  }

  throw new Error(`Unable to parse undivided symbol: ${symbol}`);
}

export function toCanonicalSymbol(symbol: string): string {
  const { base, quote } = parseSymbol(symbol);
  return `${base}/${quote}`;
}

export function toExchangeSymbol(symbol: string, exchangeId: ExchangeId): string {
  const { base, quote } = parseSymbol(symbol);

  switch (exchangeId) {
    case 'binance':
      return `${base}${quote}`;
    case 'okx':
      return `${base}-${quote}`;
    case 'bybit':
      return `${base}${quote}`;
    default:
      throw new Error(`Unsupported exchange ID: ${String(exchangeId)}`);
  }
}
