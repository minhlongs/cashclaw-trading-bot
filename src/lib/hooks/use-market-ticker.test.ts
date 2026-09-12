// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMarketTicker } from './use-market-ticker';
import type { Ticker } from '@/tree/exchange/types';

describe('useMarketTicker', () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  const mockTicker: Ticker = {
    symbol: 'BTC/USDT', last: 65432.1, bid: 65430.0, ask: 65434.0,
    high24h: 66000.0, low24h: 64000.0, volume24h: 12500.5, timestamp: 1_700_000_000_000,
  };

  const mockProvenance = {
    exchange: 'binance', provider: 'DirectTickerProvider', circuitState: 'closed' as const,
    latencyMs: 42, timestamp: 1_700_000_000_000,
  };

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('skips fetching when exchange or symbol is missing', () => {
    const { result } = renderHook(() => useMarketTicker({ exchange: undefined, symbol: undefined }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.ticker).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('skips fetching when enabled is false or exchange unsupported', () => {
    const { result: r1 } = renderHook(() => useMarketTicker({ exchange: 'binance', symbol: 'BTC/USDT', enabled: false }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r1.current.ticker).toBeNull();

    const { result: r2 } = renderHook(() => useMarketTicker({ exchange: 'coinbase', symbol: 'BTC/USDT' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r2.current.ticker).toBeNull();
  });

  it('fetches and resolves ticker data successfully', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ ok: true, ticker: mockTicker, provenance: mockProvenance }),
    });

    const { result } = renderHook(() => useMarketTicker({ exchange: 'binance', symbol: 'BTC/USDT' }));

    await waitFor(() => {
      expect(result.current.ticker).toEqual(mockTicker);
      expect(result.current.provenance).toEqual(mockProvenance);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isCircuitOpen).toBe(false);
      expect(result.current.isRateLimited).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/tickers?exchange=binance&symbol=BTC%2FUSDT', expect.anything());
  });

  it('handles HTTP 429 rate limit correctly', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 429, json: async () => ({ ok: false, error: 'Rate limit exceeded' }),
    });

    const { result } = renderHook(() => useMarketTicker({ exchange: 'okx', symbol: 'ETH/USDT' }));

    await waitFor(() => {
      expect(result.current.isRateLimited).toBe(true);
      expect(result.current.error).toContain('Rate limit exceeded');
      expect(result.current.loading).toBe(false);
    });
  });

  it('handles HTTP 503 circuit breaker state correctly', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 503,
      json: async () => ({ ok: false, error: 'Circuit breaker open', provenance: { ...mockProvenance, circuitState: 'open' } }),
    });

    const { result } = renderHook(() => useMarketTicker({ exchange: 'bybit', symbol: 'SOL/USDT' }));

    await waitFor(() => {
      expect(result.current.isCircuitOpen).toBe(true);
      expect(result.current.error).toBe('Circuit breaker open');
      expect(result.current.loading).toBe(false);
    });
  });

  it('handles network error without crashing', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network offline'));
    const { result } = renderHook(() => useMarketTicker({ exchange: 'binance', symbol: 'BTC/USDT' }));

    await waitFor(() => {
      expect(result.current.error).toBe('Network offline');
      expect(result.current.loading).toBe(false);
    });
  });

  it('polls periodically based on intervalMs', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true, ticker: mockTicker, provenance: mockProvenance }),
    });

    renderHook(() => useMarketTicker({ exchange: 'binance', symbol: 'BTC/USDT', intervalMs: 5000 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('triggers manual refetch when refetch is called', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true, ticker: mockTicker, provenance: mockProvenance }),
    });

    const { result } = renderHook(() => useMarketTicker({ exchange: 'binance', symbol: 'BTC/USDT', intervalMs: 0 }));
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(1); });

    await act(async () => { await result.current.refetch(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('changes exchange or symbol, cancels active request and refetches new pair', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true, ticker: mockTicker, provenance: mockProvenance }),
    });

    const { rerender } = renderHook(
      ({ exchange, symbol }) => useMarketTicker({ exchange, symbol }),
      { initialProps: { exchange: 'binance', symbol: 'BTC/USDT' } },
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tickers?exchange=binance&symbol=BTC%2FUSDT', expect.anything());
    });

    rerender({ exchange: 'okx', symbol: 'ETH/USDT' });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tickers?exchange=okx&symbol=ETH%2FUSDT', expect.anything());
    });
  });

  it('cancels pending fetch when unmounting', () => {
    let capturedSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => {
      capturedSignal = init?.signal;
      return new Promise(() => {});
    });

    const { unmount } = renderHook(() => useMarketTicker({ exchange: 'binance', symbol: 'BTC/USDT' }));
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
