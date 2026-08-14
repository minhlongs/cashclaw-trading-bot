import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBotInstance } from './create-bot';
import { BotInstance } from './bot-instance';
import type { GridBotConfig, MeanRevBotConfig } from './types';
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

const meanRevConfig: MeanRevBotConfig = {
  strategy: 'mean_reversion',
  symbol: 'ETHUSDT',
  exchange: 'paper',
  mode: 'paper',
  capital: 500,
  maxDrawdownPct: 20,
  bbPeriod: 20,
  bbStdDev: 2,
  rsiPeriod: 14,
  rsiBuyThreshold: 30,
  rsiSellThreshold: 70,
  volumeMultiplier: 1.5,
  positionSizePct: 10,
  cooldownMinutes: 60,
};

const defaultExchangeConfig: ExchangeConfig = {
  apiKey: '',
  apiSecret: '',
  testnet: true,
  sandbox: true,
  rateLimitMs: 100,
};

describe('createBotInstance', () => {
  let bots: Map<string, BotInstance>;
  let exchanges: Map<string, ExchangeAdapter>;
  let killswitch: Killswitch;
  let onLog: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;

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
  });

  it('creates grid bot in paper mode', async () => {
    const bot = await createBotInstance(
      { id: 'grid-1', config: gridConfig, exchangeConfig: defaultExchangeConfig, mode: 'paper' },
      { killswitch, onLog, onError },
      bots,
      exchanges,
    );
    expect(bot).toBeInstanceOf(BotInstance);
    expect(bots.has('grid-1')).toBe(true);
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('created'));
  });

  it('creates mean reversion bot', async () => {
    const bot = await createBotInstance(
      { id: 'mr-1', config: meanRevConfig, exchangeConfig: defaultExchangeConfig, mode: 'paper' },
      { killswitch, onLog, onError },
      bots,
      exchanges,
    );
    expect(bot).toBeInstanceOf(BotInstance);
    expect(bots.has('mr-1')).toBe(true);
  });

  it('throws if bot already exists', async () => {
    bots.set('grid-1', {} as BotInstance);
    await expect(
      createBotInstance(
        { id: 'grid-1', config: gridConfig, exchangeConfig: defaultExchangeConfig, mode: 'paper' },
        { killswitch, onLog, onError },
        bots,
        exchanges,
      )
    ).rejects.toThrow('Bot already exists: grid-1');
  });

  it('registers bot with killswitch', async () => {
    await createBotInstance(
      { id: 'test-ks', config: gridConfig, exchangeConfig: defaultExchangeConfig, mode: 'paper' },
      { killswitch, onLog, onError },
      bots,
      exchanges,
    );
    expect(killswitch.registerBot).toHaveBeenCalledWith('test-ks', gridConfig.capital);
  });
});
