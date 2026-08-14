import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAll = vi.fn();
const mockBind = vi.fn();
const mockPrepare = vi.fn();
const mockDb = { prepare: (...a: unknown[]) => mockPrepare(...a) };

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn() }),
}));

beforeEach(async () => {
  // Reset all mocks and re-establish chain
  vi.clearAllMocks();
  mockAll.mockReset();
  mockBind.mockReset();
  mockPrepare.mockReset();
  mockAll.mockResolvedValue({ results: [] });
  mockBind.mockReturnValue({ all: mockAll });
  mockPrepare.mockReturnValue({ bind: mockBind });
  // Re-set createServerClient to return mockDb (clearAllMocks resets implementations)
  const { createServerClient } = await import('@/lib/db/client');
  vi.mocked(createServerClient).mockReturnValue(mockDb as any);
  // Default: manager returns no bots
  const { getBotManager } = await import('@/tree/bot');
  vi.mocked(getBotManager).mockReturnValue({ getAllBots: () => [] } as any);
});

describe('getRecentEvents', () => {
  it('returns empty when DB unavailable', async () => {
    const { createServerClient } = await import('@/lib/db/client');
    vi.mocked(createServerClient).mockReturnValue(null as any);
    const { getRecentEvents } = await import('./trade-events');
    const result = await getRecentEvents(['bot-1']);
    expect(result).toEqual([]);
  });

  it('returns empty when no bot IDs and manager returns none', async () => {
    const { getRecentEvents } = await import('./trade-events');
    const result = await getRecentEvents();
    expect(result).toEqual([]);
  });

  it('maps events from explicit IDs', async () => {
    mockAll.mockResolvedValue({
      results: [{
        id: 'evt-1',
        bot_id: 'bot-1',
        event_type: 'start',
        detail_json: '{"price":50000}',
        created_at: 1000,
      }],
    });
    const { getRecentEvents } = await import('./trade-events');
    const result = await getRecentEvents(['bot-1']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('evt-1');
    expect(result[0].botId).toBe('bot-1');
    expect(result[0].eventType).toBe('start');
    expect(result[0].details).toEqual({ price: 50000 });
    expect(result[0].timestamp).toBe(1000);
  });

  it('derives bot IDs from manager', async () => {
    const { getBotManager } = await import('@/tree/bot');
    vi.mocked(getBotManager).mockReturnValue({
      getAllBots: () => [
        { getSnapshot: () => ({ id: 'bot-a' }) },
        { getSnapshot: () => ({ id: 'bot-b' }) },
      ],
    } as any);
    const { getRecentEvents } = await import('./trade-events');
    await getRecentEvents();
    expect(mockBind).toHaveBeenCalledWith('bot-a', 'bot-b', 200);
  });

  it('handles null detail_json', async () => {
    mockAll.mockResolvedValue({
      results: [{
        id: 'evt-2',
        bot_id: 'bot-1',
        event_type: 'tick',
        detail_json: null,
        created_at: 2000,
      }],
    });
    const { getRecentEvents } = await import('./trade-events');
    const result = await getRecentEvents(['bot-1']);
    expect(result[0].details).toEqual({});
  });

  it('handles malformed detail_json', async () => {
    mockAll.mockResolvedValue({
      results: [{
        id: 'evt-3',
        bot_id: 'bot-1',
        event_type: 'error',
        detail_json: 'not-valid-json{{{',
        created_at: 3000,
      }],
    });
    const { getRecentEvents } = await import('./trade-events');
    const result = await getRecentEvents(['bot-1']);
    expect(result).toHaveLength(1);
    expect(result[0].details).toEqual({});
  });

  it('returns empty on query error', async () => {
    mockAll.mockRejectedValue(new Error('D1 query failed'));
    const { getRecentEvents } = await import('./trade-events');
    const result = await getRecentEvents(['bot-1']);
    expect(result).toEqual([]);
  });
});
