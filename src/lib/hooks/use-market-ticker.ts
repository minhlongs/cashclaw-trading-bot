'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Ticker } from '@/tree/exchange/types';
import type {
  TickerProvenance,
  UseMarketTickerOptions,
  UseMarketTickerResult,
} from './use-market-ticker-types';
import {
  DEFAULT_POLL_INTERVAL_MS,
  VALID_EXCHANGES,
  requestTickerData,
} from './use-market-ticker-fetch';

export type {
  TickerProvenance,
  UseMarketTickerOptions,
  UseMarketTickerResult,
  TickerApiResponse,
  FetchOutcome,
} from './use-market-ticker-types';
export { DEFAULT_POLL_INTERVAL_MS, VALID_EXCHANGES, requestTickerData } from './use-market-ticker-fetch';

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
