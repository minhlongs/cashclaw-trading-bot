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

function httpError(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ ok: false, error: `HTTP ${status}` }),
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

describe('BotDetailPageClient — core lifecycle & error states', () => {
  it('shows loading text immediately on mount', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('shows not found message when API returns ok but no data', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, null));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('notFound')).toBeInTheDocument();
    });
  });

  it('shows not found message with bot id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, null));
    render(<BotDetailPageClient params={resolvedParams({ id: 'missing-bot' })} />);

    await waitFor(() => {
      expect(screen.getByText(/notFoundWithId/)).toBeInTheDocument();
    });
  });

  it('renders BotDetailClient with bot data when fetch succeeds', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, makeBotDetail()));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByTestId('bot-detail-client')).toBeInTheDocument();
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
      expect(screen.getByText('running')).toBeInTheDocument();
    });
  });

  it('calls /api/bots/{id} with correct URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, makeBotDetail()));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-42' })} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/bots/bot-42');
    });
  });

  it('shows not found when fetch returns non-ok HTTP status', async () => {
    fetchMock.mockResolvedValue(httpError(404));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('notFound')).toBeInTheDocument();
    });
  });

  it('shows not found when body.ok is false', async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, null, 'Bot not found'));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('notFound')).toBeInTheDocument();
    });
  });

  it('shows not found when fetch throws a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('notFound')).toBeInTheDocument();
    });
  });

  it('shows not found when non-Error is thrown', async () => {
    fetchMock.mockRejectedValue('string error');
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('notFound')).toBeInTheDocument();
    });
  });
});
