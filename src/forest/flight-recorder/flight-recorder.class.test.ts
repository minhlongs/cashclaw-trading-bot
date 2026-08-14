import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn() }));
vi.mock('./flight-recorder-helpers', () => ({ formatBotRow: vi.fn() }));

import { FlightRecorder } from './index';
import { createServerClient } from '@/lib/db/client';
import { formatBotRow } from './flight-recorder-helpers';
import { mockPreparedStmt, mockDb, sampleBotInput, sampleFillInput, sampleTickInput } from './test-utils';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(createServerClient).mockReset();
  vi.mocked(formatBotRow).mockReset();
});

describe('FlightRecorder', () => {
  describe('recordBotStart', () => {
    it('inserts bot row with correct columns and returns true', async () => {
      const stmt = mockPreparedStmt();
      vi.mocked(createServerClient).mockReturnValue(mockDb(stmt));
      const result = await new FlightRecorder().recordBotStart(sampleBotInput);

      expect(result).toBe(true);
      expect(stmt.run).toHaveBeenCalledTimes(1);
      const args = vi.mocked(stmt.bind).mock.calls[0] as unknown[];
      expect(args.slice(0, 6)).toEqual(['bot_1', 'user_1', 'TestBot', 'grid', 'BTC/USDT', 'binance']);
      expect(args[6]).toBe('live_running');
      expect(args[7]).toBe('{}');
      for (let i = 8; i <= 13; i++) expect(args[i]).toBe(0);
      expect(args[14]).toBeTypeOf('number');
      expect(args[15]).toBeTypeOf('number');
    });

    it('uses provided status when given', async () => {
      const stmt = mockPreparedStmt();
      vi.mocked(createServerClient).mockReturnValue(mockDb(stmt));
      await new FlightRecorder().recordBotStart({ ...sampleBotInput, status: 'paused' });

      const args = vi.mocked(stmt.bind).mock.calls[0] as unknown[];
      expect(args[6]).toBe('paused');
    });
  });

  describe('recordTrade', () => {
    it('inserts trade row with correct columns and returns true', async () => {
      const stmt = mockPreparedStmt();
      vi.mocked(createServerClient).mockReturnValue(mockDb(stmt));
      const result = await new FlightRecorder().recordTrade(sampleFillInput);

      expect(result).toBe(true);
      expect(stmt.run).toHaveBeenCalledTimes(1);
      const args = vi.mocked(stmt.bind).mock.calls[0] as unknown[];
      expect(args.slice(0, 11)).toEqual([
        'fill_1', 'bot_1', 'BTC/USDT', 'buy',
        50000, 51000, 0.1, 100, 1, 'filled', 'order_1',
      ]);
      expect(args[11]).toBeNull();
      expect(args[12]).toBeTypeOf('number');
      expect(args[13]).toBeNull();
      expect(args[14]).toBeTypeOf('number');
    });

    it('passes errorMessage when provided', async () => {
      const stmt = mockPreparedStmt();
      vi.mocked(createServerClient).mockReturnValue(mockDb(stmt));
      await new FlightRecorder().recordTrade({ ...sampleFillInput, errorMessage: 'insufficient balance' });

      const args = vi.mocked(stmt.bind).mock.calls[0] as unknown[];
      expect(args[11]).toBe('insufficient balance');
    });
  });

  describe('recordEvent', () => {
    it('inserts event row with correct columns and returns true', async () => {
      const stmt = mockPreparedStmt();
      vi.mocked(createServerClient).mockReturnValue(mockDb(stmt));
      const result = await new FlightRecorder().recordEvent(sampleTickInput);

      expect(result).toBe(true);
      expect(stmt.run).toHaveBeenCalledTimes(1);
      const args = vi.mocked(stmt.bind).mock.calls[0] as unknown[];
      expect(args[0]).toMatch(/^evt_/);
      expect(args.slice(1, 4)).toEqual(['bot_1', 'price_update', '{"price":50000}']);
      expect(args[4]).toBeTypeOf('number');
    });

    it('generates unique event ids', async () => {
      const stmt1 = mockPreparedStmt();
      const stmt2 = mockPreparedStmt();
      const db = mockDb(stmt1);
      vi.mocked(db.prepare).mockReturnValueOnce(stmt1).mockReturnValueOnce(stmt2);
      vi.mocked(createServerClient).mockReturnValue(db);

      const recorder = new FlightRecorder();
      await recorder.recordEvent(sampleTickInput);
      await recorder.recordEvent(sampleTickInput);

      const id1 = vi.mocked(stmt1.bind).mock.calls[0] as unknown[];
      const id2 = vi.mocked(stmt2.bind).mock.calls[0] as unknown[];
      expect(id1[0]).not.toBe(id2[0]);
    });
  });

  describe('null-db returns', () => {
    it('recordBotStart returns false', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);
      expect(await new FlightRecorder().recordBotStart(sampleBotInput)).toBe(false);
    });
    it('recordTrade returns false', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);
      expect(await new FlightRecorder().recordTrade(sampleFillInput)).toBe(false);
    });
    it('recordEvent returns false', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);
      expect(await new FlightRecorder().recordEvent(sampleTickInput)).toBe(false);
    });
    it('getBotState returns null', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);
      expect(await new FlightRecorder().getBotState('bot_1')).toBeNull();
    });
  });

  describe('getBotState', () => {
    it('returns formatted bot when found', async () => {
      const row = { id: 'bot_1', user_id: 'user_1', name: 'TestBot' };
      const formattedBot = { id: 'bot_1', user_id: 'user_1', name: 'TestBot' };
      const stmt = mockPreparedStmt();
      vi.mocked(stmt.first).mockResolvedValue(row);
      vi.mocked(createServerClient).mockReturnValue(mockDb(stmt));
      vi.mocked(formatBotRow).mockReturnValue(formattedBot as ReturnType<typeof formatBotRow>);

      const result = await new FlightRecorder().getBotState('bot_1');
      expect(result).toEqual(formattedBot);
      expect(stmt.bind).toHaveBeenCalledWith('bot_1');
      expect(formatBotRow).toHaveBeenCalledWith(row);
    });

    it('returns null when bot not found', async () => {
      const stmt = mockPreparedStmt();
      vi.mocked(stmt.first).mockResolvedValue(null);
      vi.mocked(createServerClient).mockReturnValue(mockDb(stmt));

      expect(await new FlightRecorder().getBotState('nonexistent')).toBeNull();
      expect(formatBotRow).not.toHaveBeenCalled();
    });
  });

  describe('ensureDb caching', () => {
    it('calls createServerClient only once per instance', async () => {
      vi.mocked(createServerClient).mockReturnValue(mockDb());
      const recorder = new FlightRecorder();
      await recorder.recordBotStart(sampleBotInput);
      await recorder.recordTrade(sampleFillInput);
      await recorder.getBotState('bot_1');
      expect(createServerClient).toHaveBeenCalledTimes(1);
    });

    it('caches null db and does not retry', async () => {
      vi.mocked(createServerClient).mockReturnValue(null);
      const recorder = new FlightRecorder();
      const r1 = await recorder.recordBotStart(sampleBotInput);
      const r2 = await recorder.recordBotStart(sampleBotInput);
      expect(r1).toBe(false);
      expect(r2).toBe(false);
      expect(createServerClient).toHaveBeenCalledTimes(1);
    });
  });
});
