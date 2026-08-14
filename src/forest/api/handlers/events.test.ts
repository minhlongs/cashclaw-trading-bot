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

    it('handles non-Error throw during JSON.parse (line 85 else branch)', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
        throw 'string-not-error';
      });
      mockAll.mockResolvedValue({
        results: [
          {
            id: 'ev4',
            bot_id: 'bot-4',
            event_type: 'fill',
            detail_json: 'some-value',
            created_at: 4000,
          },
        ],
      });
      const result = await eventsHandler();
      expect(result.ok).toBe(true);
      expect(result.data![0].details).toEqual({});
      parseSpy.mockRestore();
    });

    it('maps all event fields correctly across multiple rows', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({
        results: [
          {
            id: 'a1',
            bot_id: 'b1',
            event_type: 'entry',
            detail_json: '{"qty":5}',
            created_at: 100,
          },
          {
            id: 'a2',
            bot_id: 'b2',
            event_type: 'exit',
            detail_json: null,
            created_at: 200,
          },
          {
            id: 'a3',
            bot_id: 'b3',
            event_type: 'error',
            detail_json: '{}',
            created_at: 300,
          },
        ],
      });
      const result = await eventsHandler();
      expect(result.ok).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data![0]).toEqual({
        id: 'a1',
        botId: 'b1',
        eventType: 'entry',
        details: { qty: 5 },
        timestamp: 100,
      });
      expect(result.data![1]).toEqual({
        id: 'a2',
        botId: 'b2',
        eventType: 'exit',
        details: {},
        timestamp: 200,
      });
      expect(result.data![2]).toEqual({
        id: 'a3',
        botId: 'b3',
        eventType: 'error',
        details: {},
        timestamp: 300,
      });
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

    it('returns only filtered events for given botId', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({
        results: [
          {
            id: 'ev1',
            bot_id: 'target-bot',
            event_type: 'fill',
            detail_json: '{"x":1}',
            created_at: 1000,
          },
        ],
      });
      const result = await eventsHandler('target-bot');
      expect(result.ok).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].botId).toBe('target-bot');
    });
  });

  describe('no botId filter', () => {
    it('uses SQL without WHERE clause when botId is omitted', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({ results: [] });
      await eventsHandler();
      const sql = mockPrepare.mock.calls[0][0] as string;
      expect(sql).not.toContain('WHERE');
      expect(mockBind).toHaveBeenCalledWith(50);
    });

    it('defaults limit to 50 when not provided', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({ results: [] });
      await eventsHandler();
      expect(mockBind).toHaveBeenCalledWith(50);
    });

    it('treats empty-string botId as no filter (falsy)', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({ results: [] });
      await eventsHandler('');
      const sql = mockPrepare.mock.calls[0][0] as string;
      expect(sql).not.toContain('WHERE');
      expect(mockBind).toHaveBeenCalledWith(50);
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

    it('allows limit exactly at cap (200)', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({ results: [] });
      await eventsHandler(undefined, 200);
      expect(mockBind).toHaveBeenCalledWith(200);
    });

    it('passes botId and capped limit together', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockResolvedValue({ results: [] });
      await eventsHandler('my-bot', 999);
      expect(mockBind).toHaveBeenCalledWith('my-bot', 200);
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

    it('handles non-Error rejection from DB (line 63 else branch)', async () => {
      vi.mocked(createServerClient).mockReturnValue({ prepare: mockPrepare } as any);
      mockAll.mockRejectedValue('raw-string-error');
      const result = await eventsHandler();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to query events');
    });
  });
});
