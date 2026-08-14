import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createD1Callbacks, persistNewBot } from './bot-manager-helpers';
import type { BotState, BotTrade } from './types';
import type { D1CallbackDeps } from './bot-manager-helpers';

vi.mock('@/forest/bot/d1-adapter', () => ({
  persistBot: vi.fn().mockResolvedValue(undefined),
  patchBot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
}));

const gridConfig = {
  strategy: 'grid' as const,
  symbol: 'BTC/USDT',
  exchange: 'binance',
  mode: 'paper' as const,
  capital: 1000,
  maxDrawdownPct: 10,
  gridLevels: 10,
  gridSpacingPct: 1,
  capitalPerLevelPct: 10,
  takeProfitPct: 2,
  stopLossPct: 5,
  rebalanceOnFill: false,
};

function makeBotState(overrides: Partial<BotState> = {}): BotState {
  return {
    id: 'bot-123', config: gridConfig, status: 'running',
    createdAt: Date.now(), startedAt: Date.now(), error: null,
    totalPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0,
    maxDrawdown: 0, currentDrawdown: 0, stoppedAt: null,
    lastTickAt: null, lastOrderAt: null, updatedAt: Date.now(),
    ...overrides,
  };
}

function makeBotTrade(overrides: Partial<BotTrade> = {}): BotTrade {
  return {
    id: 'trade-1', botId: 'bot-123', exchangeId: 'binance', symbol: 'BTC/USDT',
    side: 'buy', type: 'limit', price: 45000, quantity: 0.1, filled: 0.1,
    fee: 0.5, pnl: 0, status: 'filled', timestamp: Date.now(), ...overrides,
  };
}

function makeDeps(overrides: Partial<D1CallbackDeps> = {}): D1CallbackDeps {
  return {
    userId: 'user-123', botId: 'bot-123', config: gridConfig,
    capital: 1000, onError: vi.fn(), onLog: vi.fn(), ...overrides,
  };
}

describe('bot-manager-helpers', () => {
  let patchBot: ReturnType<typeof vi.fn>;
  let persistBot: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const d1 = await import('@/forest/bot/d1-adapter');
    patchBot = vi.mocked(d1.patchBot);
    persistBot = vi.mocked(d1.persistBot);
  });

  describe('createD1Callbacks', () => {
    it('returns correct callback structure', () => {
      const cb = createD1Callbacks(makeDeps());
      expect(cb).toHaveProperty('onStateChange');
      expect(cb).toHaveProperty('onTrade');
      expect(cb).toHaveProperty('onLog');
      expect(cb).toHaveProperty('onError');
    });

    describe('onStateChange', () => {
      it('maps running to paper_test with timestamps', () => {
        const cb = createD1Callbacks(makeDeps());
        const state = makeBotState({ status: 'running', error: null });
        cb.onStateChange(state);
        expect(patchBot).toHaveBeenCalledWith('bot-123', expect.objectContaining({
          status: 'paper_test', started_at: state.startedAt, stopped_at: state.stoppedAt,
        }));
      });

      it.each([
        ['paused', 'paused'], ['stopped', 'stopped'], ['idle', 'draft'],
      ] as const)('maps %s to D1 status %s', (input, expected) => {
        createD1Callbacks(makeDeps()).onStateChange(makeBotState({ status: input }));
        expect(patchBot).toHaveBeenCalledWith('bot-123', expect.objectContaining({ status: expected }));
      });

      it('maps error status and includes last_error', () => {
        createD1Callbacks(makeDeps()).onStateChange(makeBotState({ status: 'error', error: 'fail' }));
        expect(patchBot).toHaveBeenCalledWith('bot-123', expect.objectContaining({
          status: 'error', last_error: 'fail',
        }));
      });

      it('does not throw on patchBot failure', () => {
        patchBot.mockRejectedValueOnce(new Error('D1 fail'));
        expect(() => createD1Callbacks(makeDeps()).onStateChange(makeBotState())).not.toThrow();
      });
    });

    describe('onTrade', () => {
      it('logs buy trade', () => {
        const deps = makeDeps();
        createD1Callbacks(deps).onTrade(makeBotTrade({ pnl: 50 }));
        expect(deps.onLog).toHaveBeenCalledWith('Trade: buy BTC/USDT @ 45000 pnl=50');
      });

      it('logs sell trade', () => {
        const deps = makeDeps();
        createD1Callbacks(deps).onTrade(makeBotTrade({ side: 'sell', price: 46000, pnl: 100 }));
        expect(deps.onLog).toHaveBeenCalledWith('Trade: sell BTC/USDT @ 46000 pnl=100');
      });

      it('logs trade with zero PnL', () => {
        const deps = makeDeps();
        createD1Callbacks(deps).onTrade(makeBotTrade({ pnl: 0 }));
        expect(deps.onLog).toHaveBeenCalledWith('Trade: buy BTC/USDT @ 45000 pnl=0');
      });
    });

    it('onLog does not throw', () => {
      expect(() => createD1Callbacks(makeDeps()).onLog('test')).not.toThrow();
    });

    it('onError calls deps.onError', () => {
      const deps = makeDeps();
      const error = new Error('test');
      createD1Callbacks(deps).onError(error, 'ctx');
      expect(deps.onError).toHaveBeenCalledWith(error, 'ctx');
    });
  });

  describe('persistNewBot', () => {
    it('calls persistBot with grid bot params', async () => {
      await persistNewBot(makeDeps());
      expect(persistBot).toHaveBeenCalledWith('user-123', {
        id: 'bot-123', config: gridConfig, capital: 1000,
        name: 'bot-123', strategy: 'grid', pair: 'BTC/USDT', exchange: 'binance',
      });
    });

    it('calls persistBot with mean_reversion params', async () => {
      const config = {
        strategy: 'mean_reversion' as const, symbol: 'ETH/USDT', exchange: 'binance',
        mode: 'paper' as const, capital: 2000, maxDrawdownPct: 10,
        bbPeriod: 20, bbStdDev: 2, rsiPeriod: 14,
        rsiBuyThreshold: 30, rsiSellThreshold: 70, volumeMultiplier: 1.5,
        positionSizePct: 10, cooldownMinutes: 5,
      };
      await persistNewBot(makeDeps({ config, capital: 2000 }));
      expect(persistBot).toHaveBeenCalledWith('user-123', expect.objectContaining({
        strategy: 'mean_reversion', pair: 'ETH/USDT',
      }));
    });
  });
});
