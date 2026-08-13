import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAll = vi.fn();
const mockBind = vi.fn().mockReturnValue({ all: mockAll });
const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue(null),
}));

import { eventsHandler } from './events';
import { createServerClient } from '@/lib/db/client';

describe('eventsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAll.mockResolvedValue({ results: [] });
  });

  describe('database unavailable', () => {
    it('returns error when createServerClient returns null', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);
      const result = await eventsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Database not available');
    });
  });

  describe('successful queries', () => {
    it('returns empty array when no events exist', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({ results: [] });
      const result = await eventsHandler();
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('returns events with parsed detail_json', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({
        results: [
          {
            id: 'ev1',
            bot_id: 'bot-1',
            event_type: 'fill',
            detail_json: '{"price":100,"side":"buy"}',
            created_at: 1000,
          },
          {
            id: 'ev2',
            bot_id: 'bot-2',
            event_type: 'error',
            detail_json: null,
            created_at: 2000,
          },
        ],
      });
      const result = await eventsHandler();
      expect(result.ok).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].details).toEqual({ price: 100, side: 'buy' });
      expect(result.data![1].details).toEqual({});
    });

    it('handles malformed detail_json gracefully', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({
        results: [
          {
            id: 'ev3',
            bot_id: 'bot-3',
            event_type: 'fill',
            detail_json: 'NOT_JSON{{',
            created_at: 3000,
          },
        ],
      });
      const result = await eventsHandler();
      expect(result.ok).toBe(true);
      expect(result.data![0].details).toEqual({});
    });
  });

  describe('botId filtering', () => {
    it('passes botId to query when provided', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({ results: [] });
      await eventsHandler('target-bot');
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE bot_id = ?'),
      );
      expect(mockBind).toHaveBeenCalledWith('target-bot', 50);
    });
  });

  describe('limit capping', () => {
    it('caps limit at MAX_LIMIT (200)', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({ results: [] });
      await eventsHandler(undefined, 500);
      expect(mockBind).toHaveBeenCalledWith(200);
    });

    it('uses provided limit when under cap', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({ results: [] });
      await eventsHandler(undefined, 25);
      expect(mockBind).toHaveBeenCalledWith(25);
    });
  });

  describe('query errors', () => {
    it('returns error when query throws', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockRejectedValue(new Error('D1 query failed'));
      const result = await eventsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to query events');
    });
  });
});
