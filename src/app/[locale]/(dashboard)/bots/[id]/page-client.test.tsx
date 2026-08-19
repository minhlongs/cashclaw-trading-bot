'use client';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BotDetailPageClient from './page-client';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/bots/bot-detail-client', () => ({
  BotDetailClient: ({ bot }: any) => (
    <div data-testid="bot-detail-client">
      <span>{bot?.name}</span>
      <span>{bot?.botStatus}</span>
    </div>
  ),
}));

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

// React 19's `use()` unwraps thenables by checking `status === 'fulfilled'`
// and returning `value` synchronously. Standard Promise.resolve() lacks
// these fields, so `use()` treats it as pending and suspends. We construct
// a thenable carrying the React promise protocol fields so `use()` resolves
// without a mock and without Suspense.
function resolvedParams<T>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & {
    status: 'fulfilled';
    value: T;
  };
  Object.defineProperty(p, 'status', {
    value: 'fulfilled',
    writable: false,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(p, 'value', {
    value,
    writable: false,
    enumerable: false,
    configurable: false,
  });
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

/* ------------------------------------------------------------------ */
/* Setup / Teardown                                                   */
/* ------------------------------------------------------------------ */

const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as any;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('BotDetailPageClient', () => {
  /* ---------------------------------------------------------------- */
  /* Loading state                                                     */
  /* ---------------------------------------------------------------- */

  it('shows loading text immediately on mount', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Not found state                                                   */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /* Data loaded                                                       */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /* Error states                                                      */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /* Recent events                                                     */
  /* ---------------------------------------------------------------- */

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

  it('maps fill event type to badge-success', async () => {
    const bot = makeBotDetail({
      recentEvents: [
        { id: 'evt-1', eventType: 'fill', details: {}, timestamp: 1_700_000_000_000 },
      ],
    });
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      const badge = screen.getByText('fill');
      expect(badge.className).toContain('badge-success');
    });
  });

  it('maps error event type to badge-error', async () => {
    const bot = makeBotDetail({
      recentEvents: [
        { id: 'evt-1', eventType: 'error', details: {}, timestamp: 1_700_000_000_000 },
      ],
    });
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      const badge = screen.getByText('error');
      expect(badge.className).toContain('badge-error');
    });
  });

  it('maps unknown event type to badge-neutral', async () => {
    const bot = makeBotDetail({
      recentEvents: [
        { id: 'evt-1', eventType: 'tick', details: {}, timestamp: 1_700_000_000_000 },
      ],
    });
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      const badge = screen.getByText('tick');
      expect(badge.className).toContain('badge-neutral');
    });
  });

  it('renders event details as JSON string', async () => {
    const bot = makeBotDetail({
      recentEvents: [
        { id: 'evt-1', eventType: 'fill', details: { price: 100, qty: 0.5 }, timestamp: 1_700_000_000_000 },
      ],
    });
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      // JSON.stringify produces {"price":100,"qty":0.5}
      expect(screen.getByText(/"price":/)).toBeInTheDocument();
    });
  });

  it('slices recent events to max 50 rows', async () => {
    const events = Array.from({ length: 60 }, (_, i) => ({
      id: `evt-${i}`,
      eventType: 'fill',
      details: {},
      timestamp: 1_700_000_000_000 + i,
    }));
    const bot = makeBotDetail({ recentEvents: events });
    fetchMock.mockResolvedValue(jsonResponse(true, bot));
    render(<BotDetailPageClient params={resolvedParams({ id: 'bot-1' })} />);

    await waitFor(() => {
      // Component slices tradeEvents to max 50 rows (slice(0,50)).
      // Each row renders a fill badge, so count badges to verify the cap.
      const badges = screen.getAllByText('fill');
      expect(badges.length).toBe(50);
    });
  });
});
