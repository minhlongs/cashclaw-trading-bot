import { describe, it, expect, vi, beforeEach } from 'vitest';

type Json = Record<string, unknown>;

// ── Hoisted mocks ─────────────────────────────────────────────

const mockAll = vi.fn();
const mockFirst = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';
import { createServerClient } from '@/lib/db/client';

function mockDbAvailable() {
  vi.mocked(createServerClient).mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ all: mockAll, first: mockFirst }),
      all: mockAll,
      first: mockFirst,
    }),
  } as any);
}

function mockDbUnavailable() {
  vi.mocked(createServerClient).mockReturnValue(null as any);
}

function mockBotGroups(...groups: { status: string; count: number }[]) {
  mockAll.mockResolvedValueOnce({ results: groups });
}

function mockTradeAgg(trades: number, pnl: number, wins: number, losses: number) {
  mockFirst.mockResolvedValueOnce({
    total_trades: trades,
    total_pnl: pnl,
    wins,
    losses,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/metrics', () => {
  it('returns safe defaults when DB unavailable', async () => {
    mockDbUnavailable();
    const res = await GET();
    const json = await res.json() as Json;
    const bots = json.bots as Record<string, unknown>;
    const perf = json.performance as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(bots.total).toBe(0);
    expect(perf.totalPnl).toBe(0);
    expect(perf.totalTrades).toBe(0);
  });

  it('aggregates bot count and status from D1', async () => {
    mockDbAvailable();
    mockBotGroups(
      { status: 'live_running', count: 2 },
      { status: 'paused', count: 1 },
      { status: 'paper_test', count: 1 },
    );
    mockTradeAgg(0, 0, 0, 0);

    const res = await GET();
    const json = await res.json() as Json;
    const bots = json.bots as Record<string, unknown>;

    expect(bots.total).toBe(4);
    expect(bots.running).toBe(2);
    expect(bots.paused).toBe(2);
  });

  it('aggregates trade performance metrics from D1', async () => {
    mockDbAvailable();
    mockBotGroups({ status: 'live_running', count: 1 });
    mockTradeAgg(10, 100, 7, 3);

    const res = await GET();
    const json = await res.json() as Json;
    const perf = json.performance as Record<string, unknown>;

    expect(perf.totalPnl).toBe(100);
    expect(perf.totalTrades).toBe(10);
    expect(perf.totalWins).toBe(7);
    expect(perf.totalLosses).toBe(3);
    expect(perf.winRate).toBe(70);
  });

  it('returns winRate 0 when no filled trades', async () => {
    mockDbAvailable();
    mockBotGroups();
    mockTradeAgg(0, 0, 0, 0);

    const res = await GET();
    const json = await res.json() as Json;
    const perf = json.performance as Record<string, unknown>;
    expect(perf.winRate).toBe(0);
  });

  it('returns empty metrics with no bots', async () => {
    mockDbAvailable();
    mockBotGroups();
    mockTradeAgg(0, 0, 0, 0);

    const res = await GET();
    const json = await res.json() as Json;
    const bots = json.bots as Record<string, unknown>;
    const perf = json.performance as Record<string, unknown>;
    expect(bots.total).toBe(0);
    expect(perf.totalPnl).toBe(0);
    expect(perf.totalTrades).toBe(0);
  });

  it('includes timestamp and uptime', async () => {
    mockDbAvailable();
    mockBotGroups();
    mockTradeAgg(0, 0, 0, 0);

    const res = await GET();
    const json = await res.json() as Json;
    expect(typeof json.timestamp).toBe('number');
    expect(typeof json.uptime).toBe('number');
  });

  it('handles D1 query errors gracefully', async () => {
    mockDbAvailable();
    mockAll.mockRejectedValue(new Error('D1 down'));

    const res = await GET();
    const json = await res.json() as Json;
    const bots = json.bots as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(bots.total).toBe(0);
  });
});
