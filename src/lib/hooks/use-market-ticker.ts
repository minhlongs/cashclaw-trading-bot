'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SupportedExchange } from '@/app/api/tickers/route';
import type { Ticker } from '@/tree/exchange/types';

export interface TickerProvenance {
  exchange: string;
  provider: string;
  circuitState: 'closed' | 'open' | 'half-open';
  latencyMs: number;
  timestamp: number;
}

export interface UseMarketTickerOptions {
  exchange?: SupportedExchange | string;
  symbol?: string;
  intervalMs?: number;
  enabled?: boolean;
}

export interface UseMarketTickerResult {
  ticker: Ticker | null;
  provenance: TickerProvenance | null;
  loading: boolean;
  error: string | null;
  isRateLimited: boolean;
  isCircuitOpen: boolean;
  refetch: () => Promise<void>;
}

interface TickerApiResponse {
  ok: boolean;
  ticker?: Ticker;
  data?: Ticker;
  provenance?: TickerProvenance;
  error?: string;
  message?: string;
}

interface FetchOutcome {
  ticker: Ticker | null;
  provenance: TickerProvenance | null;
  error: string | null;
  isRateLimited: boolean;
  isCircuitOpen: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const VALID_EXCHANGES: ReadonlySet<string> = new Set(['binance', 'okx', 'bybit']);

async function requestTickerData(exchange: string, symbol: string, signal: AbortSignal): Promise<FetchOutcome> {
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

export function useMarketTicker({
  exchange,
  symbol,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  enabled = true,
}: UseMarketTickerOptions = {}): UseMarketTickerResult {
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [provenance, setProvenance] = useState<TickerProvenance | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
  const [isCircuitOpen, setIsCircuitOpen] = useState<boolean>(false);

  const activeControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const isEligible = Boolean(
    enabled &&
    exchange &&
    symbol &&
    VALID_EXCHANGES.has(exchange.toLowerCase()),
  );

  const executeFetch = useCallback(async (): Promise<void> => {
    if (!isEligible || !exchange || !symbol) return;

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setLoading(true);

    try {
      const outcome = await requestTickerData(exchange, symbol, controller.signal);
      if (!isMountedRef.current || controller.signal.aborted) return;

      setTicker(outcome.ticker);
      setProvenance(outcome.provenance);
      setError(outcome.error);
      setIsRateLimited(outcome.isRateLimited);
      setIsCircuitOpen(outcome.isCircuitOpen);
    } catch (fetchErr: unknown) {
      if (!isMountedRef.current || controller.signal.aborted) return;
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') return;

      setError(fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch ticker data');
    } finally {
      if (isMountedRef.current && activeControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [isEligible, exchange, symbol]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!isEligible) return;

    let cancelled = false;
    async function initFetch() {
      if (cancelled) return;
      await executeFetch();
    }
    void initFetch();

    if (intervalMs <= 0) return;

    const timer = setInterval(() => {
      void executeFetch();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
      activeControllerRef.current?.abort();
    };
  }, [isEligible, executeFetch, intervalMs]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      activeControllerRef.current?.abort();
    };
  }, []);

  const refetch = useCallback(async (): Promise<void> => {
    await executeFetch();
  }, [executeFetch]);

  return {
    ticker: isEligible ? ticker : null,
    provenance: isEligible ? provenance : null,
    loading: isEligible ? loading : false,
    error: isEligible ? error : null,
    isRateLimited: isEligible ? isRateLimited : false,
    isCircuitOpen: isEligible ? isCircuitOpen : false,
    refetch,
  };
}
