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

const gridConfig: GridBotConfig = {
  strategy: 'grid',
  symbol: 'BTCUSDT',
  exchange: 'paper',
  mode: 'paper',
  capital: 1000,
  maxDrawdownPct: 15,
  gridSpacingPct: 1,
  gridLevels: 5,
  capitalPerLevelPct: 20,
  takeProfitPct: 0.5,
  stopLossPct: 2,
  rebalanceOnFill: false,
};

const defaultExchangeConfig: ExchangeConfig = {
  apiKey: '',
  apiSecret: '',
  testnet: true,
  sandbox: true,
  rateLimitMs: 100,
};

describe('createBotInstance callbacks', () => {
  let bots: Map<string, import('./bot-instance').BotInstance>;
  let exchanges: Map<string, ExchangeAdapter>;
  let killswitch: Killswitch;
  let onLog: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
  let onBotEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    bots = new Map();
    exchanges = new Map();
    killswitch = {
      registerBot: vi.fn(),
      unregisterBot: vi.fn(),
      onOrderFilled: vi.fn(),
      isTradingEnabled: vi.fn().mockReturnValue(true),
      manualHalt: vi.fn(),
      manualResume: vi.fn(),
      getState: vi.fn().mockReturnValue({ halted: false }),
    } as unknown as Killswitch;
    onLog = vi.fn();
    onError = vi.fn();
    onBotEvent = vi.fn();
  });

  it('wraps onLog messages with bot id prefix', async () => {
    await createBotInstance(
      { id: 'wrap-1', config: gridConfig, exchangeConfig: defaultExchangeConfig, mode: 'paper' },
      { killswitch, onLog, onError },
      bots,
      exchanges,
    );
    const createMsg = onLog.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('wrap-1 created'),
    );
    expect(createMsg).toBeTruthy();
    expect(createMsg![0]).toContain('Bot wrap-1 created');
  });

  it('wraps onError with bot id context', async () => {
    const bot = await createBotInstance(
      { id: 'err-1', config: gridConfig, exchangeConfig: defaultExchangeConfig, mode: 'paper' },
      { killswitch, onLog, onError },
      bots,
      exchanges,
    );
    const errorCb = (bot as unknown as { callbacks: { onError: (e: Error, ctx: string) => void } }).callbacks.onError;
    const testError = new Error('test error');
    errorCb(testError, 'test.context');
    expect(onError).toHaveBeenCalledWith(testError, 'err-1:test.context');
  });

  it('calls onBotEvent on state change', async () => {
    const bot = await createBotInstance(
      { id: 'ev-1', config: gridConfig, exchangeConfig: defaultExchangeConfig, mode: 'paper' },
      { killswitch, onLog, onError, onBotEvent },
      bots,
      exchanges,
    );
    const stateCb = (bot as unknown as { callbacks: { onStateChange: (s: unknown) => void } }).callbacks.onStateChange;
    stateCb({ status: 'running', totalPnl: 10, totalTrades: 1, winCount: 1, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, startedAt: Date.now(), stoppedAt: null, error: null, lastTickAt: null, lastOrderAt: null });
    expect(onBotEvent).toHaveBeenCalledWith('ev-1', 'state_change', { status: 'running', pnl: 10 });
  });

  it('calls onBotEvent on trade', async () => {
    const bot = await createBotInstance(
      { id: 'ev-trade', config: gridConfig, exchangeConfig: defaultExchangeConfig, mode: 'paper' },
      { killswitch, onLog, onError, onBotEvent },
      bots,
      exchanges,
    );
    const tradeCb = (bot as unknown as { callbacks: { onTrade: (t: unknown) => void } }).callbacks.onTrade;
    tradeCb({ id: 'ord-5', side: 'buy', price: 50, quantity: 2, filled: 0, status: 'open', pnl: 0 });
    expect(onBotEvent).toHaveBeenCalledWith('ev-trade', 'trade', { side: 'buy', price: 50 });
  });
});
