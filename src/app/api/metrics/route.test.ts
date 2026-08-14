import { describe, it, expect, vi, beforeEach } from 'vitest';

type Json = Record<string, unknown>;

const mockGetSnapshot = vi.fn(() => ({
  totalPnl: 100,
  totalTrades: 10,
  winCount: 7,
  lossCount: 3,
  status: 'running',
}));

const mockBot = {
  getSnapshot: mockGetSnapshot,
  id: 'bot-1',
};

const mockManager = {
  getAllBots: vi.fn(() => [mockBot]),
};

vi.mock('@/tree/bot', () => ({
  getBotManager: () => mockManager,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSnapshot.mockReturnValue({
    totalPnl: 100,
    totalTrades: 10,
    winCount: 7,
    lossCount: 3,
    status: 'running',
  });
  mockManager.getAllBots.mockReturnValue([mockBot]);
});

describe('GET /api/metrics', () => {
  it('returns bot count', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    const bots = json.bots as Record<string, unknown>;
    expect(bots.total).toBe(1);
  });

  it('aggregates performance metrics', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    const perf = json.performance as Record<string, unknown>;
    expect(perf.totalPnl).toBe(100);
    expect(perf.totalTrades).toBe(10);
    expect(perf.totalWins).toBe(7);
    expect(perf.totalLosses).toBe(3);
    expect(perf.winRate).toBe(70);
  });

  it('counts running and paused bots', async () => {
    const bot2 = {
      getSnapshot: vi.fn(() => ({
        totalPnl: -50,
        totalTrades: 5,
        winCount: 2,
        lossCount: 3,
        status: 'paused',
      })),
      id: 'bot-2',
    };
    mockManager.getAllBots.mockReturnValue([mockBot, bot2]);
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    const bots = json.bots as Record<string, unknown>;
    expect(bots.total).toBe(2);
    expect(bots.running).toBe(1);
    expect(bots.paused).toBe(1);
  });

  it('returns winRate 0 when no trades', async () => {
    mockGetSnapshot.mockReturnValue({
      totalPnl: 0,
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      status: 'running',
    });
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    const perf = json.performance as Record<string, unknown>;
    expect(perf.winRate).toBe(0);
  });

  it('returns empty metrics with no bots', async () => {
    mockManager.getAllBots.mockReturnValue([]);
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    const bots = json.bots as Record<string, unknown>;
    const perf = json.performance as Record<string, unknown>;
    expect(bots.total).toBe(0);
    expect(perf.totalPnl).toBe(0);
    expect(perf.totalTrades).toBe(0);
  });

  it('includes timestamp and uptime', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(typeof json.timestamp).toBe('number');
    expect(typeof json.uptime).toBe('number');
    expect(json.uptime as number).toBeGreaterThan(0);
  });
});
