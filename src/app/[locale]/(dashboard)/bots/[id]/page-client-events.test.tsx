'use client';

import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BotDetailPageClient from './page-client';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/bots/bot-detail-client', () => ({
  BotDetailClient: ({ bot }: { bot?: { name?: string; botStatus?: string } }) => (
    <div data-testid="bot-detail-client">
      <span>{bot?.name}</span>
      <span>{bot?.botStatus}</span>
    </div>
  ),
}));

function resolvedParams<T>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status: 'fulfilled'; value: T };
  Object.defineProperty(p, 'status', { value: 'fulfilled', writable: false, enumerable: false, configurable: false });
  Object.defineProperty(p, 'value', { value, writable: false, enumerable: false, configurable: false });
  return p;
}

interface ApiBotDetail {
  id: string;
  name: string;
  strategy: string;
  pair: string;
  exchange: string;
  status: string;
  capital: number;
  totalPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  currentDrawdown: number;
  startedAt: number | null;
  stoppedAt: number | null;
  lastTickAt: number | null;
  lastOrderAt: number | null;
  gridConfig: Record<string, unknown>;
  recentEvents?: Array<{ id: string; eventType: string; details: Record<string, unknown>; timestamp: number }>;
}

function makeBotDetail(overrides: Partial<ApiBotDetail> = {}): ApiBotDetail {
  return {
    id: 'bot-1',
    name: 'Grid BTC',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    status: 'running',
    capital: 5000,
    totalPnl: 150,
    totalTrades: 24,
    winCount: 16,
    lossCount: 8,
    maxDrawdown: 5,
    currentDrawdown: 2,
    startedAt: 1_700_000_000_000,
    stoppedAt: null,
    lastTickAt: 1_700_100_000_000,
    lastOrderAt: 1_700_050_000_000,
    gridConfig: { gridCount: 10 },
    ...overrides,
  };
}

function jsonResponse(ok: boolean, data?: ApiBotDetail | null, error?: string | null) {
  return {
    ok: true,
    json: () => Promise.resolve({ ok, data: data ?? null, error: error ?? null }),
  };
}

const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('BotDetailPageClient — recent trade events table', () => {
  it('renders trade events table when recentEvents is present', async () => {
    const bot = makeBotDetail({
      recentEvents: [
        { id: 'evt-1', eventType: 'fill', details: { price: 100 }, timestamp: 1_700_000_000_000 },
        { id: 'evt-2', eventType: 'error', details: { msg: 'oops' }, timestamp: 1_700_001_000_000 },
      ],
    });
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('tradeEvents')).toBeInTheDocument();
      expect(screen.getByText('eventType')).toBeInTheDocument();
      expect(screen.getByText('eventDetails')).toBeInTheDocument();
      expect(screen.getByText('time')).toBeInTheDocument();
    });
  });

  it('does not render trade events table when recentEvents is empty', async () => {
    const bot = makeBotDetail({ recentEvents: [] });
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByTestId('bot-detail-client')).toBeInTheDocument();
    });
    expect(screen.queryByText('tradeEvents')).not.toBeInTheDocument();
  });

  it('does not render trade events table when recentEvents is absent', async () => {
    const bot = makeBotDetail();
    delete bot.recentEvents;
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByTestId('bot-detail-client')).toBeInTheDocument();
    });
    expect(screen.queryByText('tradeEvents')).not.toBeInTheDocument();
  });

  it('maps fill, error, and unknown event types to appropriate badge classes', async () => {
    const bot = makeBotDetail({
      recentEvents: [
        { id: 'evt-1', eventType: 'fill', details: {}, timestamp: 1_700_000_000_000 },
        { id: 'evt-2', eventType: 'error', details: {}, timestamp: 1_700_000_001_000 },
        { id: 'evt-3', eventType: 'tick', details: {}, timestamp: 1_700_000_002_000 },
      ],
    });
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('fill').className).toContain('badge-success');
      expect(screen.getByText('error').className).toContain('badge-error');
      expect(screen.getByText('tick').className).toContain('badge-neutral');
    });
  });

  it('renders event details as JSON string and slices recent events to max 50 rows', async () => {
    const events = Array.from({ length: 60 }, (_, i) => ({
      id: `evt-${i}`,
      eventType: 'fill',
      details: i === 0 ? { price: 100, qty: 0.5 } : {},
      timestamp: 1_700_000_000_000 + i,
    }));
    const bot = makeBotDetail({ recentEvents: events });
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByText(/"price":/)).toBeInTheDocument();
      const badges = screen.getAllByText('fill');
      expect(badges.length).toBe(50);
    });
  });
});
