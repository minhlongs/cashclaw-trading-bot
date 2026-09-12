import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketWatchCard } from './market-watch-card';
import * as useMarketTickerModule from '@/lib/hooks/use-market-ticker';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      title: 'Live Market Watch',
      subtitle: 'Real-time multi-exchange prices & liquidity',
      exchange: 'Exchange',
      pair: 'Pair',
      lastPrice: 'Last Price',
      high24h: '24h High',
      low24h: '24h Low',
      bidAsk: 'Bid / Ask',
      spread: 'Spread',
      volume24h: '24h Volume',
      latency: 'Latency',
      circuit: 'Circuit',
      circuitClosed: 'Normal',
      circuitOpen: 'Halted',
      refresh: 'Refresh',
      rateLimited: 'Rate limited. Pausing updates...',
    };
    return map[key] ?? key;
  },
}));

describe('MarketWatchCard', () => {
  const mockTicker = {
    symbol: 'BTC/USDT', last: 67890.5, bid: 67885.0, ask: 67895.0,
    high24h: 68500.0, low24h: 66500.0, volume24h: 18450.25, timestamp: 1_700_000_000_000,
  };

  const mockProvenance = {
    exchange: 'binance', provider: 'DirectTickerProvider', circuitState: 'closed' as const,
    latencyMs: 32, timestamp: 1_700_000_000_000,
  };

  it('renders default exchange tabs and monitored pairs', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: null, provenance: null, loading: false, error: null,
      isRateLimited: false, isCircuitOpen: false, refetch: vi.fn(),
    });

    render(<MarketWatchCard />);
    expect(screen.getByText('Live Market Watch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Binance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OKX' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bybit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BTC / USDT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ETH / USDT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SOL / USDT' })).toBeInTheDocument();
  });

  it('renders ticker metrics accurately when loaded', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: mockTicker,
      provenance: mockProvenance,
      loading: false,
      error: null,
      isRateLimited: false,
      isCircuitOpen: false,
      refetch: vi.fn(),
    });

    render(<MarketWatchCard />);
    expect(screen.getByText('$67,890.50')).toBeInTheDocument();
    expect(screen.getByText('32ms')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('$68,500.00')).toBeInTheDocument();
    expect(screen.getByText('$66,500.00')).toBeInTheDocument();
    expect(screen.getByText('$67,885.00 / $67,895.00')).toBeInTheDocument();
    expect(screen.getByText('Spread: $10.00')).toBeInTheDocument();
    expect(screen.getByText('18,450.25')).toBeInTheDocument();
  });

  it('switches exchange tab and requests ticker for new exchange', async () => {
    const hookSpy = vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: mockTicker,
      provenance: mockProvenance,
      loading: false,
      error: null,
      isRateLimited: false,
      isCircuitOpen: false,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    render(<MarketWatchCard />);

    await user.click(screen.getByRole('button', { name: 'OKX' }));

    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({ exchange: 'okx', symbol: 'BTC/USDT' }),
    );
  });

  it('switches pair and requests ticker for new symbol', async () => {
    const hookSpy = vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: mockTicker,
      provenance: mockProvenance,
      loading: false,
      error: null,
      isRateLimited: false,
      isCircuitOpen: false,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    render(<MarketWatchCard />);

    await user.click(screen.getByRole('button', { name: 'ETH / USDT' }));

    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({ exchange: 'binance', symbol: 'ETH/USDT' }),
    );
  });

  it('displays circuit halted status when circuit is open', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: mockTicker,
      provenance: { ...mockProvenance, circuitState: 'open' },
      loading: false,
      error: null,
      isRateLimited: false,
      isCircuitOpen: true,
      refetch: vi.fn(),
    });

    render(<MarketWatchCard />);
    expect(screen.getByText('Halted')).toBeInTheDocument();
  });

  it('displays rate limit banner when throttled', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: mockTicker,
      provenance: mockProvenance,
      loading: false,
      error: null,
      isRateLimited: true,
      isCircuitOpen: false,
      refetch: vi.fn(),
    });

    render(<MarketWatchCard />);
    expect(screen.getByText('Rate limited. Pausing updates...')).toBeInTheDocument();
  });

  it('calls refetch when manual refresh button is clicked', async () => {
    const refetchMock = vi.fn();
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: mockTicker,
      provenance: mockProvenance,
      loading: false,
      error: null,
      isRateLimited: false,
      isCircuitOpen: false,
      refetch: refetchMock,
    });

    const user = userEvent.setup();
    render(<MarketWatchCard />);

    const refreshBtn = screen.getByRole('button', { name: 'Refresh' });
    await user.click(refreshBtn);

    expect(refetchMock).toHaveBeenCalled();
  });

  it('renders error message when fetch fails and no ticker is loaded', () => {
    vi.spyOn(useMarketTickerModule, 'useMarketTicker').mockReturnValue({
      ticker: null,
      provenance: null,
      loading: false,
      error: 'Upstream gateway error 502',
      isRateLimited: false,
      isCircuitOpen: false,
      refetch: vi.fn(),
    });

    render(<MarketWatchCard />);
    expect(screen.getByText('Upstream gateway error 502')).toBeInTheDocument();
  });
});
