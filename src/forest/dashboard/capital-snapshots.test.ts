import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAll = vi.fn();
const mockBind = vi.fn().mockReturnValue({ all: mockAll });
const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
const mockDb = { prepare: mockPrepare };

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(() => mockDb),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockAll.mockResolvedValue({ results: [] });
});

describe('getCapitalSnapshots', () => {
  it('returns empty when no snapshots', async () => {
    const { getCapitalSnapshots } = await import('./capital-snapshots');
    const result = await getCapitalSnapshots('bot-1');
    expect(result).toEqual([]);
  });

  it('returns mapped snapshots', async () => {
    mockAll.mockResolvedValue({
      results: [{
        id: 'snap-1',
        bot_id: 'bot-1',
        total_capital: 5000,
        realized_pnl: 100,
        unrealized_pnl: 50,
        max_drawdown_pct: 5,
        win_count: 3,
        loss_count: 1,
        total_trades: 4,
        created_at: 1000,
      }],
    });
    const { getCapitalSnapshots } = await import('./capital-snapshots');
    const result = await getCapitalSnapshots('bot-1');
    expect(result).toHaveLength(1);
    expect(result[0].botId).toBe('bot-1');
    expect(result[0].totalCapital).toBe(5000);
    expect(result[0].realizedPnl).toBe(100);
    expect(result[0].unrealizedPnl).toBe(50);
    expect(result[0].maxDrawdownPct).toBe(5);
    expect(result[0].winCount).toBe(3);
    expect(result[0].lossCount).toBe(1);
    expect(result[0].totalTrades).toBe(4);
    expect(result[0].timestamp).toBe(1000);
  });

  it('returns empty when DB unavailable', async () => {
    const { createServerClient } = await import('@/lib/db/client');
    vi.mocked(createServerClient).mockReturnValue(null as any);
    const { getCapitalSnapshots } = await import('./capital-snapshots');
    const result = await getCapitalSnapshots('bot-1');
    expect(result).toEqual([]);
  });

  it('returns empty on query error', async () => {
    mockAll.mockRejectedValue(new Error('D1 query failed'));
    const { getCapitalSnapshots } = await import('./capital-snapshots');
    const result = await getCapitalSnapshots('bot-1');
    expect(result).toEqual([]);
  });
});
