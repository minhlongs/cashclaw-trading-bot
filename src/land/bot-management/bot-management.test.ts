import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotInstance } from '@/tree/bot/bot-instance';
import type { BotState, GridBotConfig, MeanRevBotConfig } from '@/tree/bot/types';

const gridCfg: GridBotConfig = {
  strategy: 'grid', symbol: 'BTC/USDT', exchange: 'binance',
  mode: 'paper', capital: 1000, maxDrawdownPct: 15,
  gridSpacingPct: 100, gridLevels: 10, capitalPerLevelPct: 10,
  takeProfitPct: 2, stopLossPct: 3, rebalanceOnFill: false,
};
const mrCfg: MeanRevBotConfig = {
  strategy: 'mean_reversion', symbol: 'ETH/USDT', exchange: 'binance',
  mode: 'paper', capital: 500, maxDrawdownPct: 15,
  bbPeriod: 20, bbStdDev: 2, rsiPeriod: 14,
  rsiBuyThreshold: 30, rsiSellThreshold: 70,
  volumeMultiplier: 1.5, positionSizePct: 10, cooldownMinutes: 60,
};
function mkState(o: Partial<BotState> = {}): BotState {
  return {
    id: 'b1', config: gridCfg, status: 'idle', createdAt: Date.now(),
    totalPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0,
    maxDrawdown: 0, currentDrawdown: 0, startedAt: null, stoppedAt: null,
    lastTickAt: null, lastOrderAt: null, error: null, updatedAt: Date.now(), ...o,
  };
}
function mkBot(id: string, o: Partial<BotState> = {}, cfg: GridBotConfig | MeanRevBotConfig = gridCfg): BotInstance {
  return {
    id, getSnapshot: vi.fn().mockReturnValue(mkState({ id, ...o })),
    getConfig: vi.fn().mockReturnValue(cfg),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn(),
  } as unknown as BotInstance;
}
const ks = { manualHalt: vi.fn(), manualResume: vi.fn(), isTradingEnabled: vi.fn().mockReturnValue(true) };
const m = {
  getAllBots: vi.fn().mockReturnValue([]), getRunningBots: vi.fn().mockReturnValue([]),
  getBot: vi.fn().mockReturnValue(undefined), createBot: vi.fn(),
  startBot: vi.fn().mockResolvedValue(undefined), stopBot: vi.fn(),
  pauseBot: vi.fn(), resumeBot: vi.fn(), removeBot: vi.fn(),
  haltAll: vi.fn(), resumeAll: vi.fn(), isTradingEnabled: vi.fn().mockReturnValue(true),
  getKillswitch: vi.fn().mockReturnValue(ks),
};
vi.mock('@/tree/bot', () => ({ getBotManager: vi.fn(() => m), resetBotManager: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn().mockReturnValue(null) }));

const gridInput = { id: 'b1', name: 'T', strategy: 'grid' as const, pair: 'BTC/USDT', exchange: 'binance', capital: 1000, mode: 'paper' as const, config: {} };
const mrInput = { id: 'b2', name: 'T', strategy: 'mean_reversion' as const, pair: 'ETH/USDT', exchange: 'binance', capital: 500, mode: 'paper' as const, config: {} };

describe('bot-management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getAllBots.mockReturnValue([]);
    m.getRunningBots.mockReturnValue([]);
    m.getBot.mockReturnValue(undefined);
    m.isTradingEnabled.mockReturnValue(true);
    ks.isTradingEnabled.mockReturnValue(true);
  });
  describe('getAllBots', () => {
    it('returns empty when no bots', async () => {
      const { getAllBots } = await import('./index');
      expect(getAllBots()).toEqual([]);
    });
    it('maps bots to BotInfo list', async () => {
      m.getAllBots.mockReturnValue([mkBot('b1'), mkBot('b2')]);
      const { getAllBots } = await import('./index');
      expect(getAllBots()).toHaveLength(2);
      expect(getAllBots()[0].id).toBe('b1');
    });
  });
  describe('getRunningBots', () => {
    it('returns running bots', async () => {
      m.getRunningBots.mockReturnValue([mkBot('b1', { status: 'running' })]);
      const { getRunningBots } = await import('./index');
      expect(getRunningBots()).toHaveLength(1);
    });
  });
  describe('getBot', () => {
    it('returns undefined for unknown id', async () => {
      const { getBot } = await import('./index');
      expect(getBot('x')).toBeUndefined();
    });
    it('returns BotInfo for existing bot', async () => {
      m.getBot.mockReturnValue(mkBot('b1'));
      const { getBot } = await import('./index');
      expect(getBot('b1')?.id).toBe('b1');
    });
  });
  describe('createBot', () => {
    it('creates grid bot', async () => {
      m.createBot.mockResolvedValue(mkBot('b1'));
      const { createBot } = await import('./index');
      const r = await createBot(gridInput);
      expect(r.id).toBe('b1');
      expect(r.strategy).toBe('grid');
    });
    it('creates mean_reversion bot', async () => {
      m.createBot.mockResolvedValue(mkBot('b2', {}, mrCfg));
      const { createBot } = await import('./index');
      const r = await createBot(mrInput);
      expect(r.strategy).toBe('mean_reversion');
    });
    it('propagates manager errors', async () => {
      m.createBot.mockRejectedValue(new Error('Duplicate'));
      const { createBot } = await import('./index');
      await expect(createBot(gridInput)).rejects.toThrow('Duplicate');
    });
  });
  describe('startBot', () => {
    it('returns ok on success', async () => {
      const { startBot } = await import('./index');
      const r = await startBot('b1');
      expect(r.ok).toBe(true);
      expect(m.startBot).toHaveBeenCalledWith('b1');
    });
    it('returns error message on failure', async () => {
      m.startBot.mockRejectedValue(new Error('Bad'));
      const { startBot } = await import('./index');
      const r = await startBot('b1');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('Bad');
    });
    it('returns generic error for non-Error throw', async () => {
      m.startBot.mockRejectedValue('str');
      const r = await (await import('./index')).startBot('b1');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('Start failed');
    });
  });
  describe('stopBot', () => {
    it('returns ok on success', async () => {
      const r = (await import('./index')).stopBot('b1');
      expect(r.ok).toBe(true);
    });
    it('returns error on failure', async () => {
      m.stopBot.mockImplementation(() => { throw new Error('Stop'); });
      const r = (await import('./index')).stopBot('b1');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('Stop');
    });
  });
  describe('pauseBot', () => {
    it('returns ok on success', async () => {
      const r = (await import('./index')).pauseBot('b1');
      expect(r.ok).toBe(true);
    });
    it('returns error on failure', async () => {
      m.pauseBot.mockImplementation(() => { throw new Error('Pause'); });
      const r = (await import('./index')).pauseBot('b1');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('Pause');
    });
  });
  describe('resumeBot', () => {
    it('returns ok on success', async () => {
      const r = (await import('./index')).resumeBot('b1');
      expect(r.ok).toBe(true);
    });
    it('returns error if killswitch halted', async () => {
      m.resumeBot.mockImplementation(() => { throw new Error('Cannot resume: killswitch is halted'); });
      const r = (await import('./index')).resumeBot('b1');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('killswitch');
    });
  });
  describe('removeBot', () => {
    it('delegates to manager', async () => {
      (await import('./index')).removeBot('b1');
      expect(m.removeBot).toHaveBeenCalledWith('b1');
    });
  });
  describe('haltAll / resumeAll / isTradingEnabled / resetAll', () => {
    it('haltAll calls manualHalt', async () => {
      (await import('./index')).haltAll('r');
      expect(ks.manualHalt).toHaveBeenCalledWith('r');
    });
    it('resumeAll calls manualResume', async () => {
      (await import('./index')).resumeAll();
      expect(ks.manualResume).toHaveBeenCalled();
    });
    it('isTradingEnabled returns killswitch value', async () => {
      ks.isTradingEnabled.mockReturnValue(false);
      expect((await import('./index')).isTradingEnabled()).toBe(false);
    });
    it('resetAll calls resetBotManager', async () => {
      const { resetBotManager } = await import('@/tree/bot');
      (await import('./index')).resetAll();
      expect(resetBotManager).toHaveBeenCalled();
    });
  });
});
