import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateBot = vi.fn().mockResolvedValue({});
const mockGetBotManager = vi.fn().mockReturnValue({ createBot: mockCreateBot });

vi.mock('@/tree/bot', () => ({
  getBotManager: (...args: unknown[]) => mockGetBotManager(...args),
}));

vi.mock('@/forest/bot/d1-adapter', () => ({
  loadAllBotsFromD1: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue(null),
}));

import { botCreateHandler, type CreateBotPayload } from './bot-create';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';

function paperPayload(overrides: Partial<CreateBotPayload> = {}): CreateBotPayload {
  return {
    id: 'test-bot',
    name: 'Test Bot',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'paper',
    capital: 1000,
    config: { gridSpacing: 0.01, gridSize: 10 },
    ...overrides,
  };
}

describe('botCreateHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateBot.mockResolvedValue({});
    vi.mocked(loadAllBotsFromD1).mockResolvedValue(undefined);
  });

  describe('live mode rejection', () => {
    it('rejects live mode with error message', async () => {
      const result = await botCreateHandler(paperPayload({ mode: 'live' }));
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Live trading not available in v1 — paper mode only');
    });
  });

  describe('successful creation', () => {
    it('returns ok with bot id', async () => {
      const result = await botCreateHandler(paperPayload());
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ id: 'test-bot' });
    });

    it('calls loadAllBotsFromD1 before creating', async () => {
      await botCreateHandler(paperPayload());
      expect(vi.mocked(loadAllBotsFromD1)).toHaveBeenCalledTimes(1);
    });

    it('calls manager.createBot with correct config', async () => {
      await botCreateHandler(paperPayload());
      expect(mockCreateBot).toHaveBeenCalledTimes(1);
      const req = mockCreateBot.mock.calls[0][0];
      expect(req.id).toBe('test-bot');
      expect(req.mode).toBe('paper');
      // strategyConfig has strategy-specific fields, not id/name
      expect(req.config).toMatchObject({
        strategy: 'grid',
        symbol: 'BTC/USDT',
        exchange: 'paper',
        capital: 1000,
      });
      expect(req.exchangeConfig).toMatchObject({
        apiKey: '',
        apiSecret: '',
        testnet: true,
        sandbox: true,
      });
    });

    it('builds mean_reversion config for mean_reversion strategy', async () => {
      await botCreateHandler(paperPayload({ strategy: 'mean_reversion', config: { lookbackPeriod: 20, zScoreThreshold: 2 } }));
      const req = mockCreateBot.mock.calls[0][0];
      expect(req.config.strategy).toBe('mean_reversion');
    });
  });

  describe('error handling', () => {
    it('returns error when createBot throws', async () => {
      mockCreateBot.mockRejectedValue(new Error('Bot already exists: dup'));
      const result = await botCreateHandler(paperPayload({ id: 'dup' }));
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Bot already exists: dup');
    });

    it('returns generic error for non-Error exceptions', async () => {
      mockCreateBot.mockRejectedValue('unexpected');
      const result = await botCreateHandler(paperPayload());
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to create bot');
    });

    it('returns error when loadAllBotsFromD1 throws', async () => {
      vi.mocked(loadAllBotsFromD1).mockRejectedValue(new Error('D1 load failed'));
      const result = await botCreateHandler(paperPayload());
      expect(result.ok).toBe(false);
      expect(result.error).toBe('D1 load failed');
    });
  });
});
