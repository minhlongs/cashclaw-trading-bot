import type { FetchOutcome, TickerApiResponse } from './use-market-ticker-types';

export const DEFAULT_POLL_INTERVAL_MS = 15_000;
export const VALID_EXCHANGES: ReadonlySet<string> = new Set(['binance', 'okx', 'bybit']);

export async function requestTickerData(
  exchange: string,
  symbol: string,
  signal: AbortSignal,
): Promise<FetchOutcome> {
  const url = `/api/tickers?exchange=${encodeURIComponent(exchange.toLowerCase())}&symbol=${encodeURIComponent(symbol)}`;
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (response.status === 429) {
    return {
      ticker: null,
      provenance: null,
      error: 'Rate limit exceeded. Pausing updates...',
      isRateLimited: true,
      isCircuitOpen: false,
    };
  }

  const body = (await response.json()) as TickerApiResponse;
  const isCircuitOpen = response.status === 503 || body.provenance?.circuitState === 'open';

  if (response.ok && body.ok && (body.ticker || body.data)) {
    return {
      ticker: body.ticker ?? body.data ?? null,
      provenance: body.provenance ?? null,
      error: null,
      isRateLimited: false,
      isCircuitOpen,
    };
  }

  const errorMsg = body.error ?? body.message ?? `Request failed (${response.status})`;
  return {
    ticker: null,
    provenance: body.provenance ?? null,
    error: errorMsg,
    isRateLimited: false,
    isCircuitOpen,
  };
}
