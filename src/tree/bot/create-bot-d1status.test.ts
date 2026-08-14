import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBotInstance } from './create-bot';
import type { GridBotConfig } from './types';
import type { ExchangeAdapter, ExchangeConfig } from '../exchange/types';
import type { Killswitch } from './killswitch';

vi.mock('@/forest/bot/d1-adapter', () => ({
  persistBot: vi.fn().mockResolvedValue(undefined),
  patchBot: vi.fn().mockResolvedValue(undefined),
  persistTrade: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const cfg: GridBotConfig = {
  strategy: 'grid', symbol: 'BTCUSDT', exchange: 'paper', mode: 'paper', capital: 1000,
  maxDrawdownPct: 15, gridSpacingPct: 1, gridLevels: 5, capitalPerLevelPct: 20,
  takeProfitPct: 0.5, stopLossPct: 2, rebalanceOnFill: false,
};
const exCfg: ExchangeConfig = { apiKey: '', apiSecret: '', testnet: true, sandbox: true, rateLimitMs: 100 };
const base = { totalPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, startedAt: null, stoppedAt: null, error: null, lastTickAt: null, lastOrderAt: null };

function makeKs(): Killswitch {
  return {
    registerBot: vi.fn(), unregisterBot: vi.fn(), onOrderFilled: vi.fn(),
    isTradingEnabled: vi.fn().mockReturnValue(true), manualHalt: vi.fn(),
    manualResume: vi.fn(), getState: vi.fn().mockReturnValue({ halted: false }),
  } as unknown as Killswitch;
}

function setup() {
  return { bots: new Map(), exchanges: new Map<string, ExchangeAdapter>(), killswitch: makeKs(), onLog: vi.fn(), onError: vi.fn() };
}

type BotCbs = { callbacks: { onStateChange: (s: unknown) => void; onTrade: (t: unknown) => void } };

describe('createBotInstance D1 persistence', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => { vi.clearAllMocks(); env = setup(); });

  it('calls persistBot when userId present', async () => {
    const { persistBot } = await import('@/forest/bot/d1-adapter');
    await createBotInstance({ id: 'pb-1', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    expect(persistBot).toHaveBeenCalledWith('u-1', expect.objectContaining({ id: 'pb-1', capital: 1000, strategy: 'grid', pair: 'BTCUSDT' }));
  });

  it('does not call persistBot when no userId', async () => {
    const { persistBot } = await import('@/forest/bot/d1-adapter');
    await createBotInstance({ id: 'pb-2', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, env, env.bots, env.exchanges);
    expect(persistBot).not.toHaveBeenCalled();
  });

  it('calls patchBot on state change when userId present', async () => {
    const { patchBot } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 'p-1', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onStateChange({ ...base, status: 'running', totalPnl: 5 });
    expect(patchBot).toHaveBeenCalledWith('p-1', expect.objectContaining({ status: 'paper_test', total_pnl: 5 }));
  });

  it('does not call patchBot when no userId', async () => {
    const { patchBot } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 'p-2', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, env, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onStateChange({ ...base, status: 'idle' });
    expect(patchBot).not.toHaveBeenCalled();
  });

  it('calls persistTrade on trade when userId present', async () => {
    const { persistTrade } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 't-1', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onTrade({ id: 'o-1', side: 'buy', price: 100, quantity: 1, filled: 1, status: 'filled', pnl: 5 });
    expect(persistTrade).toHaveBeenCalledWith('t-1', expect.objectContaining({ side: 'buy', entryPrice: 100, pnl: 5, status: 'filled' }));
  });

  it('sets exitPrice on filled sell trade', async () => {
    const { persistTrade } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 't-2', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onTrade({ id: 'o-2', side: 'sell', price: 110, quantity: 1, filled: 1, status: 'filled', pnl: 10 });
    expect(persistTrade).toHaveBeenCalledWith('t-2', expect.objectContaining({ side: 'sell', exitPrice: 110 }));
  });

  it('sets open status on non-filled trade', async () => {
    const { persistTrade } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 't-3', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onTrade({ id: 'o-3', side: 'buy', price: 100, quantity: 0.5, filled: 0, status: 'open', pnl: 0 });
    expect(persistTrade).toHaveBeenCalledWith('t-3', expect.objectContaining({ status: 'open' }));
  });

  it('does not call persistTrade when no userId', async () => {
    const { persistTrade } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 't-4', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, env, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onTrade({ id: 'o-4', side: 'buy', price: 100, quantity: 1, filled: 0, status: 'open', pnl: 0 });
    expect(persistTrade).not.toHaveBeenCalled();
  });

  it('maps idle to draft', async () => {
    const { patchBot } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 'd1-idle', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onStateChange({ ...base, status: 'idle' });
    expect(patchBot).toHaveBeenCalledWith('d1-idle', expect.objectContaining({ status: 'draft' }));
  });

  it('maps error to error', async () => {
    const { patchBot } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 'd1-err', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onStateChange({ ...base, status: 'error', error: 'fail' });
    expect(patchBot).toHaveBeenCalledWith('d1-err', expect.objectContaining({ status: 'error', last_error: 'fail' }));
  });

  it('maps stopped to stopped', async () => {
    const { patchBot } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 'd1-stop', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onStateChange({ ...base, status: 'stopped', stoppedAt: 1000 });
    expect(patchBot).toHaveBeenCalledWith('d1-stop', expect.objectContaining({ status: 'stopped', stopped_at: 1000 }));
  });

  it('maps paused to paused', async () => {
    const { patchBot } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 'd1-pause', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onStateChange({ ...base, status: 'paused' });
    expect(patchBot).toHaveBeenCalledWith('d1-pause', expect.objectContaining({ status: 'paused' }));
  });

  it('maps running to paper_test', async () => {
    const { patchBot } = await import('@/forest/bot/d1-adapter');
    const bot = await createBotInstance({ id: 'd1-run', config: cfg, exchangeConfig: exCfg, mode: 'paper' }, { ...env, userId: 'u-1' }, env.bots, env.exchanges);
    (bot as unknown as BotCbs).callbacks.onStateChange({
      ...base, status: 'running', totalPnl: 20, totalTrades: 5, winCount: 3, lossCount: 2,
      maxDrawdown: 1.5, currentDrawdown: 0.5, startedAt: 100, lastTickAt: 200, lastOrderAt: 300,
    });
    expect(patchBot).toHaveBeenCalledWith('d1-run', expect.objectContaining({
      status: 'paper_test', total_pnl: 20, win_count: 3, loss_count: 2,
      max_drawdown: 1.5, started_at: 100, last_tick_at: 200, last_order_at: 300,
    }));
  });
});
