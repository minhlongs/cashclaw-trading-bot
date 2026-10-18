import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock('@/lib/logger', () => ({ createLogger: vi.fn(() => mockLogger) }));

const mockGetBotManager = vi.fn();
vi.mock('@/tree/bot', () => ({ getBotManager: (...args: unknown[]) => mockGetBotManager(...args) }));

const mockKillswitchInstance = {
  isTradingEnabled: vi.fn().mockReturnValue(true),
  isEnabled: vi.fn().mockReturnValue(true),
  isHalted: vi.fn().mockReturnValue(false),
};
vi.mock('@/tree/bot/killswitch', () => ({ Killswitch: vi.fn().mockImplementation(() => mockKillswitchInstance) }));

const mockProvider = { isCircuitOpen: vi.fn().mockReturnValue(false) };
const mockOrchestratorInstance = { getProvider: vi.fn().mockReturnValue(mockProvider), registerProvider: vi.fn() };
vi.mock('@/land/exchange-orchestration', () => ({ getExchangeOrchestrator: vi.fn().mockReturnValue(mockOrchestratorInstance) }));

const mockD1Run = vi.fn().mockResolvedValue({ success: true });
const mockD1Bind = vi.fn().mockReturnValue({ run: mockD1Run });
const mockD1All = vi.fn().mockResolvedValue({ results: [] });
const mockD1Prepare = vi.fn().mockReturnValue({ bind: mockD1Bind, all: mockD1All });
vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn().mockReturnValue({ prepare: (...args: unknown[]) => mockD1Prepare(...args) }) }));

vi.mock('@/tree/telemetry/writer', () => ({
  TelemetryWriter: vi.fn().mockImplementation(() => ({ emit: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) })),
}));

const mockFindAllBots = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/db/repositories', () => ({ findBotsByUser: vi.fn(), findAllBots: (...args: unknown[]) => mockFindAllBots(...args) }));

describe('BotScheduler — error resilience, auto-restart & rate limits', () => {
  let tickCount = 0;

  function makeMockBot(overrides: Record<string, unknown> = {}) {
    const { hasStrategy: hs, ...rest } = overrides;
    return {
      id: rest.id ?? 'bot-1',
      getStatus: vi.fn().mockReturnValue(rest.status ?? 'running'),
      getConfig: vi.fn().mockReturnValue({
        exchange: rest.exchange ?? 'binance', symbol: rest.symbol ?? 'BTC/USDT', capital: rest.capital ?? 1000,
      }),
      tick: vi.fn().mockResolvedValue(undefined),
      hasStrategy: vi.fn().mockReturnValue(hs ?? true),
      start: vi.fn().mockResolvedValue(undefined),
      getSnapshot: vi.fn().mockReturnValue({ id: rest.id ?? 'bot-1', totalPnl: rest.totalPnl ?? 0 }),
      ...rest,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    tickCount = 0;
    mockGetBotManager.mockReturnValue({
      getRunningBots: vi.fn().mockResolvedValue([]),
      getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      drainQueues: vi.fn().mockResolvedValue({}),
    });
    mockKillswitchInstance.isTradingEnabled.mockReturnValue(true);
    mockOrchestratorInstance.getProvider.mockReturnValue(mockProvider);
    mockProvider.isCircuitOpen.mockReturnValue(false);
    mockD1Run.mockResolvedValue({ success: true });
    mockD1All.mockResolvedValue({ results: [] });
    mockLogger.warn.mockImplementation(() => {});
    mockLogger.error.mockImplementation(() => {});
  });

  async function createScheduler(deps: Record<string, unknown> = {}) {
    const { BotScheduler } = await import('./scheduler');
    return new BotScheduler({ getNow: () => ++tickCount * 1000, ...deps });
  }

  describe('error handling in tick()', () => {
    it('catches errors from bot.tick() and reports them', async () => {
      const onEvalError = vi.fn();
      const bot = makeMockBot({ id: 'b1' });
      bot.tick.mockRejectedValue(new Error('exchange timeout'));
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockResolvedValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler({ onEvalError });
      const report = await scheduler.tick();

      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]).toEqual({ botId: 'b1', message: 'exchange timeout' });
      expect(onEvalError).toHaveBeenCalledWith('b1', expect.objectContaining({ message: 'exchange timeout' }));
    });

    it('continues to next bot after one bot errors', async () => {
      const bot1 = makeMockBot({ id: 'b1' });
      bot1.tick.mockRejectedValue(new Error('fail'));
      const bot2 = makeMockBot({ id: 'b2' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockResolvedValue([bot1, bot2]),
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
        getRunningBots: vi.fn().mockResolvedValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler();
      const report = await scheduler.tick();

      expect(report.errors[0].message).toBe('string error');
    });
  });

  describe('auto-restart after cold-start hydration', () => {
    it('starts running bots that have no strategy instance', async () => {
      const bot = makeMockBot({ id: 'b1', hasStrategy: false });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockResolvedValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler();
      await scheduler.tick();

      expect(bot.start).toHaveBeenCalledTimes(1);
      expect(bot.tick).toHaveBeenCalledTimes(1);
    });

    it('does not start bots that already have a strategy', async () => {
      const bot = makeMockBot({ id: 'b1', hasStrategy: true });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockResolvedValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler();
      await scheduler.tick();

      expect(bot.start).not.toHaveBeenCalled();
      expect(bot.tick).toHaveBeenCalledTimes(1);
    });

    it('reports auto-restart failures without blocking the tick', async () => {
      const bot = makeMockBot({ id: 'b1', hasStrategy: false });
      bot.start.mockRejectedValue(new Error('ticker fetch failed'));
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockResolvedValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler();
      const report = await scheduler.tick();

      expect(bot.start).toHaveBeenCalledTimes(1);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].botId).toBe('b1');
      expect(report.errors[0].message).toContain('Auto-restart failed');
    });
  });

  describe('D1 persist failure & rate-limit tracking', () => {
    it('logs warning but does not throw when D1 persist fails', async () => {
      const bot = makeMockBot({ id: 'b1' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockResolvedValue([bot]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });
      mockD1Run.mockRejectedValue(new Error('D1 timeout'));

      const scheduler = await createScheduler();
      const report = await scheduler.tick();

      expect(report.halted).toBe(false);
      expect(report.botsEvaluated).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('D1 persist failed'),
        expect.objectContaining({ action: 'persistBot' }),
      );
    });

    it('tracks rate-limit usage per exchange and clears between ticks', async () => {
      const bot1 = makeMockBot({ id: 'b1', exchange: 'binance' });
      const bot2 = makeMockBot({ id: 'b2', exchange: 'binance' });
      const bot3 = makeMockBot({ id: 'b3', exchange: 'bybit' });
      mockGetBotManager.mockReturnValue({
        getRunningBots: vi.fn().mockResolvedValue([bot1, bot2, bot3]),
        getKillswitch: vi.fn().mockReturnValue(mockKillswitchInstance),
      });

      const scheduler = await createScheduler({
        getOrchestrator: () => mockOrchestratorInstance as never,
      });
      const r1 = await scheduler.tick();
      const r2 = await scheduler.tick();

      expect(r1.rateLimitUsage).toEqual({ binance: 2, bybit: 1 });
      expect(r2.rateLimitUsage).toEqual({ binance: 2, bybit: 1 });
    });

    it('returns empty rateLimitUsage when no orchestrator', async () => {
      const scheduler = await createScheduler();
      const report = await scheduler.tick();
      expect(report.rateLimitUsage).toEqual({});
    });
  });
});
