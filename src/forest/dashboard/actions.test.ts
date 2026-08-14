// Tests for forest/dashboard server actions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDashboardData,
  getKpis,
  getBotCards,
  getRecentEvents,
  getCapitalSnapshots,
  botActionStart,
  botActionStop,
  botActionPause,
  botActionResume,
  killswitchActionHalt,
  killswitchActionResume,
} from './actions';

// ── Bot stub (lightweight, matches BotInstance surface area) ──
const makeMockBot = () => ({
  getSnapshot: () => ({
    id: 'bot-1',
    status: 'running' as const,
    totalPnl: 100.5,
    totalTrades: 10,
    winCount: 7,
    lossCount: 3,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  }),
  getConfig: () => ({
    strategy: 'grid' as const,
    symbol: 'BTC/USDT',
    capital: 1000,
    exchange: 'binance',
  }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  destroy: vi.fn(),
});

let mockBot = makeMockBot();

// ── Singleton intercept ────────────────────────────────────────
// vitest hoists vi.mock. The mock factory returns fresh closures that
// capture the module-scope `mockBot` and `mockManager` variables.
// beforeEach clears mock state + re-creates mockBot so every test sees
// a clean singleton.
const mockManager = {
  getAllBots: () => [mockBot],
  getBot: (id: string) => (id === 'bot-1' ? mockBot : undefined),
  manualHalt: vi.fn(),
  manualResume: vi.fn(),
  resumeBot: vi.fn(),
};

// resetBotManager is a real function (not vi.fn) so beforeEach can call
// it to clear the real module-level singleton inside bot-manager.ts,
// preventing stale state from leaking between tests.
const _doReset = () => {
  mockBot = makeMockBot();
  // Also clear the internal singleton map in the real bot-manager module
  // by re-importing and calling the real reset (not the mock).
  // Since vitest replaces the export, we use the closure to reset state.
};

vi.mock('@/tree/bot', () => {
  const reset = () => {
    mockBot = makeMockBot();
  };
  return {
    getBotManager: (_deps?: unknown) => mockManager,
    resetBotManager: reset,
  };
});

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => null, // local dev — skip D1
}));

describe('Dashboard Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBot = makeMockBot(); // re-seed bot reference for each test
  });

  describe('getDashboardData', () => {
    it('computes kpis from runtime bot state', async () => {
      const data = await getDashboardData();
      expect(data.kpis.totalBalance).toBe(1100.5); // 1000 capital + 100.5 pnl
      expect(data.kpis.activeBots).toBe(1);
      expect(data.kpis.todayPnl).toBeGreaterThan(0);
      expect(data.kpis.winRate).toBe(70); // 7/10 wins
      expect(data.bots).toHaveLength(1);
      expect(data.bots[0].id).toBe('bot-1');
      expect(data.bots[0].strategy).toBe('grid');
    });

    it('returns empty events when no D1 client (local dev)', async () => {
      const data = await getDashboardData();
      expect(data.recentEvents).toEqual([]);
    });
  });

  describe('getKpis', () => {
    it('returns aggregated metrics', async () => {
      const kpis = await getKpis();
      expect(kpis.activeBots).toBe(1);
      expect(kpis.totalBalance).toBe(1100.5);
      expect(kpis.winRate).toBe(70);
    });
  });

  describe('getBotCards', () => {
    it('maps bot snapshots to card shape', async () => {
      const cards = await getBotCards();
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({
        id: 'bot-1',
        strategy: 'grid',
        pair: 'BTC/USDT',
        botStatus: 'running',
        totalPnl: 100.5,
        winCount: 7,
        lossCount: 3,
      });
    });
  });

  describe('getRecentEvents', () => {
    it('returns empty array when D1 client returns null', async () => {
      const events = await getRecentEvents();
      expect(events).toEqual([]);
    });

    it('returns bot-specific events when IDs provided', async () => {
      const events = await getRecentEvents(['bot-1']);
      expect(events).toEqual([]);
    });

    it('returns empty for empty botIds array', async () => {
      const events = await getRecentEvents([]);
      expect(events).toEqual([]);
    });
  });

  describe('getCapitalSnapshots', () => {
    it('returns empty when no D1 client', async () => {
      const snapshots = await getCapitalSnapshots('bot-1');
      expect(snapshots).toEqual([]);
    });
  });

  describe('bot actions', () => {
    it('botActionStart calls bot.start()', async () => {
      const result = await botActionStart('bot-1');
      expect(result.ok).toBe(true);
      expect(mockBot.start).toHaveBeenCalled();
    });

    it('botActionStart returns error for missing bot', async () => {
      // Override mockBot with one that has no matching id in getBot
      mockBot = makeMockBot();
      const result = await botActionStart('nonexistent');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('botActionStop calls bot.stop()', async () => {
      const result = await botActionStop('bot-1');
      expect(result.ok).toBe(true);
      expect(mockBot.stop).toHaveBeenCalled();
    });

    it('botActionPause calls bot.pause()', async () => {
      const result = await botActionPause('bot-1');
      expect(result.ok).toBe(true);
      expect(mockBot.pause).toHaveBeenCalled();
    });

    it('botActionResume calls manager.resumeBot(id)', async () => {
      const result = await botActionResume('bot-1');
      expect(result.ok).toBe(true);
      expect(mockManager.resumeBot).toHaveBeenCalledWith('bot-1');
    });
  });

  describe('killswitch actions', () => {
    it('killswitchActionHalt calls manualHalt with reason', async () => {
      const result = await killswitchActionHalt('test reason');
      expect(result.ok).toBe(true);
      expect(mockManager.manualHalt).toHaveBeenCalledWith('test reason');
    });

    it('killswitchActionResume calls manualResume', async () => {
      const result = await killswitchActionResume();
      expect(result.ok).toBe(true);
      expect(mockManager.manualResume).toHaveBeenCalled();
    });
  });
});
