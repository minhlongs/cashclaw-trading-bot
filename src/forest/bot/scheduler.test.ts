import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock factory functions (hoisted by vitest) ──────────────────────────────

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};
vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

const mockGetBotManager = vi.fn();
vi.mock('@/tree/bot', () => ({
  getBotManager: (...args: unknown[]) => mockGetBotManager(...args),
}));

const mockKillswitchInstance = {
  isTradingEnabled: vi.fn().mockReturnValue(true),
  isEnabled: vi.fn().mockReturnValue(true),
  isHalted: vi.fn().mockReturnValue(false),
};
vi.mock('@/tree/bot/killswitch', () => ({
  Killswitch: vi.fn().mockImplementation(() => mockKillswitchInstance),
}));

const mockProvider = {
  isCircuitOpen: vi.fn().mockReturnValue(false),
};
const mockOrchestratorInstance = {
  getProvider: vi.fn().mockReturnValue(mockProvider),
  registerProvider: vi.fn(),
};
vi.mock('@/land/exchange-orchestration', () => ({
  getExchangeOrchestrator: vi.fn().mockReturnValue(mockOrchestratorInstance),
}));

const mockD1Run = vi.fn().mockResolvedValue({ success: true });
const mockD1Bind = vi.fn().mockReturnValue({ run: mockD1Run });
const mockD1Prepare = vi.fn().mockReturnValue({ bind: mockD1Bind });
vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue({
    prepare: (...args: unknown[]) => mockD1Prepare(...args),
  }),
}));

vi.mock('@/tree/telemetry/writer', () => ({
  TelemetryWriter: vi.fn().mockImplementation(() => ({
    emit: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

describe('BotScheduler', () => {
  let tickCount = 0;

  function makeMockBot(overrides: Record<string, unknown> = {}) {
    return {
      id: overrides.id ?? 'bot-1',
      getStatus: vi.fn().mockReturnValue(overrides.status ?? 'running'),
      getConfig: vi.fn().mockReturnValue({
        exchange: overrides.exchange ?? 'binance',
        symbol: overrides.symbol ?? 'BTC/USDT',
        capital: overrides.capital ?? 1000,
      }),
      tick: vi.fn().mockResolvedValue(undefined),
      getSnapshot: vi.fn().mockReturnValue({
        id: overrides.id ?? 'bot-1',
        totalPnl: overrides.totalPnl ?? 0,
      }),
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    tickCount = 0;

    // Re-establish mock implementations cleared by clearAllMocks
    mockGetBotManager.mockReturnValue({
      getRunningBots: vi.fn().mockReturnValue([]),
      getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
    });
    mockKillswitchInstance.isTradingEnabled.mockReturnValue(true);
    mockOrchestratorInstance.getProvider.mockReturnValue(mockProvider);
    mockProvider.isCircuitOpen.mockReturnValue(false);
    mockD1Run.mockResolvedValue({ success: true });
    mockLogger.warn.mockImplementation(() => {});
    mockLogger.error.mockImplementation(() => {});
  });

  async function createScheduler(deps: Record<string, unknown> = {}) {
    const { BotScheduler } = await import('./scheduler');
    return new BotScheduler({
      getNow: () => ++tickCount * 1000,
      ...deps,
    });
  }

  describe('tick()', () => {
    it('returns tickCount incremented and botsEvaluated = 0 when no running bots', async () => {
      const scheduler = await createScheduler();
      const report = await scheduler.tick();
      expect(report.halted).toBe(false);
      expect(report.tickCount).toBe(1);
      expect(report.botsEvaluated).toBe(0);
      expect(report.errors).toEqual([]);
    });

    it('returns halted = true when killswitch trading is disabled', async () => {
      mockKillswitchInstance.isTradingEnabled.mockReturnValue(false);
      const scheduler = await createScheduler();
      const report = await scheduler.tick();
      expect(report.halted).toBe(true);
      expect(report.botsEvaluated).toBe(0);
    });

    it('ticks each running bot and increments tickCount', async () => {
      const bot1 = makeMockBot({ id: 'b1' });
      const bot2 = makeMockBot({ id: 'b2' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot1, bot2]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler();
      const report = await scheduler.tick();

      expect(report.botsEvaluated).toBe(2);
      expect(report.errors).toEqual([]);
      expect(bot1.tick).toHaveBeenCalledTimes(1);
      expect(bot2.tick).toHaveBeenCalledTimes(1);
      expect(report.tickCount).toBe(1);
    });

    it('persists bot state to D1 after successful tick', async () => {
      const bot = makeMockBot({ id: 'b1', totalPnl: 12.5 });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler();
      await scheduler.tick();

      expect(mockD1Prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE bots'),
      );
      expect(mockD1Bind).toHaveBeenCalledWith(12.5, expect.any(Number), 'b1');
      expect(mockD1Run).toHaveBeenCalledTimes(1);
    });

    it('skips bots when circuit is open for their exchange', async () => {
      const onEvalError = vi.fn();
      const bot = makeMockBot({ id: 'b1', exchange: 'kraken' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });
      mockProvider.isCircuitOpen.mockReturnValue(true);

      const scheduler = await createScheduler({
        onEvalError,
        getOrchestrator: () => mockOrchestratorInstance as any,
      });
      const report = await scheduler.tick();

      expect(bot.tick).not.toHaveBeenCalled();
      // botsEvaluated = runningBots.length (skipped bots still count)
      expect(report.botsEvaluated).toBe(1);
      expect(report.errors).toEqual([]);
      expect(onEvalError).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ message: expect.stringContaining('Circuit open') }),
      );
    });

    it('catches errors from bot.tick() and reports them', async () => {
      const onEvalError = vi.fn();
      const bot = makeMockBot({ id: 'b1' });
      bot.tick.mockRejectedValue(new Error('exchange timeout'));
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler({ onEvalError });
      const report = await scheduler.tick();

      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]).toEqual({
        botId: 'b1',
        message: 'exchange timeout',
      });
      expect(onEvalError).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ message: 'exchange timeout' }),
      );
    });

    it('continues to next bot after one bot errors', async () => {
      const bot1 = makeMockBot({ id: 'b1' });
      bot1.tick.mockRejectedValue(new Error('fail'));
      const bot2 = makeMockBot({ id: 'b2' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot1, bot2]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler();
      const report = await scheduler.tick();

      expect(bot1.tick).toHaveBeenCalled();
      expect(bot2.tick).toHaveBeenCalled();
      expect(report.botsEvaluated).toBe(2);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].botId).toBe('b1');
    });

    it('handles non-Error thrown values gracefully', async () => {
      const bot = makeMockBot({ id: 'b1' });
      bot.tick.mockRejectedValue('string error');
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler();
      const report = await scheduler.tick();

      expect(report.errors[0].message).toBe('string error');
    });

    it('does not check circuit when no orchestrator provided', async () => {
      const bot = makeMockBot({ id: 'b1' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      // No getOrchestrator in deps — circuit check should be skipped
      const scheduler = await createScheduler();
      const report = await scheduler.tick();

      expect(bot.tick).toHaveBeenCalledTimes(1);
      expect(report.botsEvaluated).toBe(1);
    });
  });

  describe('getStats()', () => {
    it('returns tickCount and lastTickAt', async () => {
      const scheduler = await createScheduler();
      expect(scheduler.getStats()).toEqual({ tickCount: 0, lastTickAt: null });
      await scheduler.tick();
      const stats = scheduler.getStats();
      expect(stats.tickCount).toBe(1);
      expect(stats.lastTickAt).toBeGreaterThan(0);
    });
  });

  describe('D1 persist failure (non-fatal)', () => {
    it('logs warning but does not throw when D1 persist fails', async () => {
      const bot = makeMockBot({ id: 'b1' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });
      mockD1Run.mockRejectedValue(new Error('D1 timeout'));

      const scheduler = await createScheduler();
      // Should NOT throw even though D1 fails
      const report = await scheduler.tick();

      expect(report.halted).toBe(false);
      expect(report.botsEvaluated).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('D1 persist failed'),
        expect.objectContaining({ action: 'persistBot' }),
      );
    });
  });

  describe('multiple ticks', () => {
    it('increments tickCount across multiple ticks', async () => {
      const scheduler = await createScheduler();
      const r1 = await scheduler.tick();
      const r2 = await scheduler.tick();
      const r3 = await scheduler.tick();
      expect(r1.tickCount).toBe(1);
      expect(r2.tickCount).toBe(2);
      expect(r3.tickCount).toBe(3);
    });
  });

  describe('rate-limit tracking', () => {
    it('tracks rate-limit usage per exchange in tick report', async () => {
      const bot1 = makeMockBot({ id: 'b1', exchange: 'binance' });
      const bot2 = makeMockBot({ id: 'b2', exchange: 'binance' });
      const bot3 = makeMockBot({ id: 'b3', exchange: 'bybit' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot1, bot2, bot3]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });
      mockProvider.isCircuitOpen.mockReturnValue(false);

      const scheduler = await createScheduler({
        getOrchestrator: () => mockOrchestratorInstance as any,
      });
      const report = await scheduler.tick();

      expect(report.rateLimitUsage).toEqual({ binance: 2, bybit: 1 });
    });

    it('returns empty rateLimitUsage when no orchestrator', async () => {
      const scheduler = await createScheduler();
      const report = await scheduler.tick();
      expect(report.rateLimitUsage).toEqual({});
    });

    it('clears rate-limit counts between ticks', async () => {
      const bot = makeMockBot({ id: 'b1', exchange: 'binance' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockReturnValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });
      mockProvider.isCircuitOpen.mockReturnValue(false);

      const scheduler = await createScheduler({
        getOrchestrator: () => mockOrchestratorInstance as any,
      });
      const r1 = await scheduler.tick();
      const r2 = await scheduler.tick();
      expect(r1.rateLimitUsage.binance).toBe(1);
      expect(r2.rateLimitUsage.binance).toBe(1);
    });
  });
});
