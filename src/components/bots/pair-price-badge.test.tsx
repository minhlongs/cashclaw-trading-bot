import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PairPriceBadge } from './pair-price-badge';
import * as useMarketTickerModule from '@/lib/hooks/use-market-ticker';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      livePrice: 'Live Price',
      fetchingPrice: 'Fetching price...',
      unavailable: 'Price unavailable',
      circuitActive: 'Exchange circuit open',
      rateLimited: 'Rate limited',
    };
    return map[key] ?? key;
  },
}));

describe('PairPriceBadge', () => {
  it('renders nothing when exchange or pair is empty', () => {
    const { container: c1 } = render(<PairPriceBadge exchange="" pair="BTC/USDT" />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<PairPriceBadge exchange="binance" pair="" />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders loading state when fetching without ticker', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: null,
      provenance: null,
      loading: true,
      error: null,
      isRateLimited: false,
      isCircuitOpen: false,
      refetch: vi.fn(),
    });

    render(<PairPriceBadge exchange="binance" pair="BTC/USDT" />);
    expect(screen.getByTestId('pair-price-loading')).toBeInTheDocument();
    expect(screen.getByText('Fetching price...')).toBeInTheDocument();
  });

  it('renders live price and latency when ticker is loaded', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: {
        symbol: 'BTC/USDT',
        last: 65432.1,
        bid: 65430,
        ask: 65434,
        high24h: 66000,
        low24h: 64000,
        volume24h: 12000,
        timestamp: 1_700_000_000_000,
      },
      provenance: {
        exchange: 'binance',
        provider: 'DirectTickerProvider',
        circuitState: 'closed',
        latencyMs: 38,
        timestamp: 1_700_000_000_000,
      },
      loading: false,
      error: null,
      isRateLimited: false,
      isCircuitOpen: false,
      refetch: vi.fn(),
    });

    render(<PairPriceBadge exchange="binance" pair="BTC/USDT" />);
    expect(screen.getByTestId('pair-price-badge')).toBeInTheDocument();
    expect(screen.getByText('$65,432.10')).toBeInTheDocument();
    expect(screen.getByText('38ms')).toBeInTheDocument();
  });

  it('renders circuit warning badge when circuit is open', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: {
        symbol: 'ETH/USDT',
        last: 3450.5,
        bid: 3450,
        ask: 3451,
        high24h: 3500,
        low24h: 3400,
        volume24h: 5000,
        timestamp: 1_700_000_000_000,
      },
      provenance: {
        exchange: 'okx',
        provider: 'DirectTickerProvider',
        circuitState: 'open',
        latencyMs: 120,
        timestamp: 1_700_000_000_000,
      },
      loading: false,
      error: null,
      isRateLimited: false,
      isCircuitOpen: true,
      refetch: vi.fn(),
    });

    render(<PairPriceBadge exchange="okx" pair="ETH/USDT" />);
    expect(screen.getByText('Exchange circuit open')).toBeInTheDocument();
  });

  it('renders rate limit badge when throttled', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: {
        symbol: 'SOL/USDT',
        last: 145.25,
        bid: 145,
        ask: 145.5,
        high24h: 150,
        low24h: 140,
        volume24h: 8000,
        timestamp: 1_700_000_000_000,
      },
      provenance: null,
      loading: false,
      error: 'Rate limit exceeded',
      isRateLimited: true,
      isCircuitOpen: false,
      refetch: vi.fn(),
    });

    render(<PairPriceBadge exchange="bybit" pair="SOL/USDT" />);
    expect(screen.getByText('Rate limited')).toBeInTheDocument();
  });

  it('renders unavailable badge when error occurs and no ticker is present', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: null,
      provenance: null,
      loading: false,
      error: 'Network error',
      isRateLimited: false,
      isCircuitOpen: false,
      refetch: vi.fn(),
    });

    render(<PairPriceBadge exchange="binance" pair="BTC/USDT" />);
    expect(screen.getByTestId('pair-price-error')).toBeInTheDocument();
    expect(screen.getByText('Price unavailable')).toBeInTheDocument();
  });
});
