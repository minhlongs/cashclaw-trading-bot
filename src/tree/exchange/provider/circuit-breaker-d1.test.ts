import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveState, loadState } from './circuit-persistence';

type SaveRow = {
  state: string;
  failure_count: number;
  cooldown_until: number | null;
};

function createMockD1(rows: Map<string, SaveRow> = new Map()) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => {
          // no-op
        }),
        first: vi.fn(async (): Promise<{ state: string; failure_count: number; cooldown_until: number | null } | undefined> => {
          return undefined;
        }),
      })),
    })),
    _rows: rows,
  };
}

function fillLoad(
  mock: ReturnType<typeof createMockD1>,
  id: string,
  payload: SaveRow | undefined,
) {
  // make the next prepare().bind().first() call return the payload
  const first = vi.fn();
  if (payload) {
    first.mockResolvedValueOnce(payload);
  } else {
    first.mockResolvedValueOnce(undefined);
  }
  mock.prepare.mockReturnValueOnce({
    bind: vi.fn(() => ({
      run: vi.fn(async () => {}),
      first,
    })),
  });
}

describe('circuit-persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('saveState', () => {
    it('persists state to D1 without throwing', async () => {
      const db = createMockD1();
      await saveState(
        db as unknown as import('@/lib/db/client').D1Database,
        'bot-1',
        'binance',
        'open',
        5,
        1000,
      );

      expect(db.prepare).toHaveBeenCalledTimes(1);
    });

    it('handles null db gracefully (no-op)', async () => {
      await expect(
        saveState(null, 'bot-1', 'binance', 'degraded', 2),
      ).resolves.toBeUndefined();
    });

    it('handles save errors without throwing', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn(async () => { throw new Error('D1 unavailable'); }),
          })),
        })),
      };

      await expect(
        saveState(db as unknown as import('@/lib/db/client').D1Database, 'bot-1', 'binance', 'open', 3),
      ).resolves.toBeUndefined();
    });
  });

  describe('loadState', () => {
    it('loads state from D1', async () => {
      const db = createMockD1();
      fillLoad(db, 'bot-1', { state: 'open', failure_count: 5, cooldown_until: 1000 });

      const result = await loadState(
        db as unknown as import('@/lib/db/client').D1Database,
        'bot-1',
      );

      expect(result).toEqual({
        state: 'open',
        failureCount: 5,
        cooldownUntil: 1000,
      });
    });

    it('returns null when no row found', async () => {
      const db = createMockD1();
      fillLoad(db, 'bot-1', undefined);

      const result = await loadState(
        db as unknown as import('@/lib/db/client').D1Database,
        'bot-1',
      );

      expect(result).toBeNull();
    });

    it('handles null db gracefully', async () => {
      const result = await loadState(null, 'bot-1');

      expect(result).toBeNull();
    });

    it('returns null on D1 read errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => { throw new Error('D1 read failed'); }),
          })),
        })),
      };

      const result = await loadState(
        db as unknown as import('@/lib/db/client').D1Database,
        'bot-1',
      );

      expect(result).toBeNull();
    });
  });
});