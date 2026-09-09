import { describe, it, expect, vi } from 'vitest';
import { tick, type TickContext } from './bot-tick';
import type { BotState, GridBotConfig, BotCallbacks } from './types';
import type { Ticker, ExchangeAdapter } from '../exchange/types';
import type { ExchangeOrchestrator } from '@/land/exchange-orchestration';

const SYMBOL = 'BTC/USDT';

const mkTicker = (o: Partial<Ticker> = {}): Ticker => ({
  symbol: SYMBOL,
  last: 50000,
  bid: 49950,
  ask: 50050,
  high24h: 51000,
  low24h: 49000,
  volume24h: 1200,
  timestamp: Date.now(),
  ...o,
});

const mkState = (): BotState => ({
  id: 'bot-1',
  config: {
    strategy: 'grid',
    symbol: SYMBOL,
    exchange: 'binance',
    mode: 'paper',
    capital: 1000,
    gridSpacingPct: 1,
    gridLevels: 4,
    capitalPerLevelPct: 25,
    takeProfitPct: 2,
    stopLossPct: 3,
    rebalanceOnFill: false,
    maxDrawdownPct: 15,
  },
  status: 'running',
  createdAt: Date.now(),
  startedAt: Date.now(),
  error: null,
  totalPnl: 0,
  totalTrades: 0,
  winCount: 0,
  lossCount: 0,
  maxDrawdown: 0,
  currentDrawdown: 0,
  stoppedAt: null,
  lastTickAt: null,
  lastOrderAt: null,
  updatedAt: Date.now(),
});

const mkCallbacks = (): BotCallbacks => ({
  onStateChange: vi.fn(),
  onTrade: vi.fn(),
  onLog: vi.fn(),
  onError: vi.fn(),
});

describe('bot-tick orchestrator branches', () => {
  it('uses exchangeOrchestrator to fetch ticker successfully', async () => {
    const mockOrchestrator = {
      fetchTicker: vi.fn().mockResolvedValue({
        ok: true,
        data: mkTicker({ last: 53000 }),
      }),
    } as unknown as ExchangeOrchestrator;

    const ctx: TickContext = {
      id: 'bot-1',
      config: mkState().config as GridBotConfig,
      deps: {
        exchange: {} as ExchangeAdapter,
        killswitch: { isTradingEnabled: () => true, haltReason: null } as never,
        exchangeOrchestrator: mockOrchestrator,
      },
      callbacks: mkCallbacks(),
      state: mkState(),
      strategy: null,
      strategyChain: null,
      lastTickPrice: null,
      placeOrder: vi.fn().mockResolvedValue({ id: '1' }),
      pause: vi.fn(),
      emitTelemetry: vi.fn(),
      emitState: vi.fn(),
    };

    const res = await tick(ctx);
    expect(res.lastTickPrice).toBe(53000);
    expect(mockOrchestrator.fetchTicker).toHaveBeenCalledWith('paper', SYMBOL);
  });

  it('handles exchangeOrchestrator returning ok=false', async () => {
    const mockOrchestrator = {
      fetchTicker: vi.fn().mockResolvedValue({
        ok: false,
        error: 'Exchange unavailable',
      }),
    } as unknown as ExchangeOrchestrator;

    const callbacks = mkCallbacks();
    const ctx: TickContext = {
      id: 'bot-1',
      config: mkState().config as GridBotConfig,
      deps: {
        exchange: {} as ExchangeAdapter,
        killswitch: { isTradingEnabled: () => true, haltReason: null } as never,
        exchangeOrchestrator: mockOrchestrator,
      },
      callbacks,
      state: mkState(),
      strategy: null,
      strategyChain: null,
      lastTickPrice: 50000,
      placeOrder: vi.fn(),
      pause: vi.fn(),
      emitTelemetry: vi.fn(),
      emitState: vi.fn(),
    };

    const res = await tick(ctx);
    expect(res.lastTickPrice).toBe(50000);
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Failed to fetch ticker') }),
      'bot.tick',
    );
  });
});
