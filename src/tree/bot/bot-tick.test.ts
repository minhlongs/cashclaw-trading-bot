import { describe, it, expect, vi } from 'vitest';
import { tick, type TickContext } from './bot-tick';
import type { BotState, GridBotConfig, BotCallbacks } from './types';
import type { Ticker, ExchangeAdapter } from '../exchange/types';

vi.mock('./bot-strategy', () => ({
  evaluateChain: vi.fn().mockReturnValue(null),
}));

const SYMBOL = 'BTC/USDT';

const mkTicker = (o: Partial<Ticker> = {}): Ticker => ({
  symbol: SYMBOL, last: 50000, bid: 49950, ask: 50050,
  high24h: 51000, low24h: 49000, volume24h: 1200, timestamp: Date.now(), ...o,
});

const mkState = (o: Partial<BotState> = {}): BotState => ({
  id: 'bot-1', config: mkGridCfg(), status: 'running', createdAt: Date.now(),
  startedAt: Date.now(), error: null, totalPnl: 0, totalTrades: 0, winCount: 0,
  lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, stoppedAt: null,
  lastTickAt: null, lastOrderAt: null, updatedAt: Date.now(), ...o,
});

const mkGridCfg = (o: Partial<GridBotConfig> = {}): GridBotConfig => ({
  strategy: 'grid', symbol: SYMBOL, exchange: 'binance', mode: 'paper', capital: 1000,
  gridSpacingPct: 1, gridLevels: 4, capitalPerLevelPct: 25, takeProfitPct: 2,
  stopLossPct: 3, rebalanceOnFill: false, maxDrawdownPct: 15, ...o,
});

const mkCallbacks = (): BotCallbacks => ({
  onStateChange: vi.fn(), onTrade: vi.fn(), onLog: vi.fn(), onError: vi.fn(),
});

const mkExchange = (o: Partial<ExchangeAdapter> = {}): ExchangeAdapter => ({
  id: 'binance', name: 'Binance', fetchTicker: vi.fn().mockResolvedValue(mkTicker()),
  placeOrder: vi.fn().mockResolvedValue({ id: '1' }),
  fetchBalance: vi.fn().mockResolvedValue({ currency: 'USDT', free: 1000, used: 0, total: 1000 }),
  fetchOpenOrders: vi.fn().mockResolvedValue([]), cancelOrder: vi.fn().mockResolvedValue({}),
  fetchPositions: vi.fn().mockResolvedValue([]), ...o,
} as ExchangeAdapter);

const mkKs = (o: Record<string, unknown> = {}) => ({
  isTradingEnabled: vi.fn().mockReturnValue(true), haltReason: null,
  check: vi.fn(), halt: vi.fn(), resume: vi.fn(), ...o,
} as unknown as import('./killswitch').Killswitch);

const mkCtx = (o: Partial<TickContext> = {}): TickContext => ({
  id: o.id ?? 'bot-1', config: o.config ?? mkGridCfg(),
  deps: o.deps ?? { exchange: mkExchange(), killswitch: mkKs() },
  callbacks: o.callbacks ?? mkCallbacks(), state: o.state ?? mkState(),
  strategy: o.strategy ?? { onTicker: vi.fn() } as never,
  strategyChain: o.strategyChain ?? null, lastTickPrice: o.lastTickPrice ?? null,
  placeOrder: o.placeOrder ?? vi.fn().mockResolvedValue({ id: '1' }),
  pause: o.pause ?? vi.fn(), emitTelemetry: o.emitTelemetry ?? vi.fn(),
  emitState: o.emitState ?? vi.fn(),
});

describe('tick', () => {
  it('returns lastTickPrice when status is not running', async () => {
    const ctx = mkCtx({
      lastTickPrice: 55555,
      state: mkState({ status: 'paused' }),
    });
    const result = await tick(ctx);
    expect(result.lastTickPrice).toBe(55555);
  });

  it('calls pause and logs when killswitch disables trading', async () => {
    const callbacks = mkCallbacks();
    const pause = vi.fn();
    const killswitch = mkKs({
      isTradingEnabled: vi.fn().mockReturnValue(false),
      haltReason: 'Daily loss limit',
    });
    const ctx = mkCtx({
      lastTickPrice: 44444,
      callbacks,
      pause,
      deps: { exchange: mkExchange(), killswitch },
    });
    const result = await tick(ctx);
    expect(result.lastTickPrice).toBe(44444);
    expect(pause).toHaveBeenCalled();
    expect(callbacks.onLog).toHaveBeenCalledWith(expect.stringContaining('killswitch'));
  });

  it('fetches price and emits telemetry on success', async () => {
    const ticker = mkTicker({ last: 52000 });
    const exchange = mkExchange({ fetchTicker: vi.fn().mockResolvedValue(ticker) });
    const emitTelemetry = vi.fn();
    const emitState = vi.fn();
    const ctx = mkCtx({
      deps: { exchange, killswitch: mkKs() },
      emitTelemetry,
      emitState,
    });
    const result = await tick(ctx);
    expect(result.lastTickPrice).toBe(52000);
    expect(ctx.state.lastTickAt).toBeGreaterThan(0);
    expect(emitTelemetry).toHaveBeenCalledWith('tick', { price: 52000, pnl: 0 });
    expect(emitState).toHaveBeenCalled();
  });

  it('returns lastTickPrice unchanged when price is zero', async () => {
    const exchange = mkExchange({
      fetchTicker: vi.fn().mockResolvedValue(mkTicker({ last: 0 })),
    });
    const ctx = mkCtx({
      lastTickPrice: 30000,
      deps: { exchange, killswitch: mkKs() },
    });
    const result = await tick(ctx);
    expect(result.lastTickPrice).toBe(30000);
  });

  it('catches fetchTicker errors and reports via onError', async () => {
    const exchange = mkExchange({
      fetchTicker: vi.fn().mockRejectedValue(new Error('Network timeout')),
    });
    const callbacks = mkCallbacks();
    const ctx = mkCtx({
      deps: { exchange, killswitch: mkKs() },
      callbacks,
    });
    const result = await tick(ctx);
    expect(result.lastTickPrice).toBeNull();
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Network timeout' }),
      'bot.tick',
    );
  });

  it('handles non-Error thrown from fetchTicker', async () => {
    const exchange = mkExchange({
      fetchTicker: vi.fn().mockRejectedValue('string error'),
    });
    const callbacks = mkCallbacks();
    const ctx = mkCtx({
      deps: { exchange, killswitch: mkKs() },
      callbacks,
    });
    await tick(ctx);
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'string error' }),
      'bot.tick',
    );
  });

  it('calls strategy.onTicker when strategy is present', async () => {
    const onTicker = vi.fn();
    const strategy = { onTicker } as never;
    const ticker = mkTicker();
    const exchange = mkExchange({ fetchTicker: vi.fn().mockResolvedValue(ticker) });
    const ctx = mkCtx({
      strategy,
      deps: { exchange, killswitch: mkKs() },
    });
    await tick(ctx);
    expect(onTicker).toHaveBeenCalledWith(ticker);
  });

  it('does not call strategy.onTicker when strategy is null', async () => {
    const exchange = mkExchange();
    const ctx = mkCtx({
      strategy: null,
      deps: { exchange, killswitch: mkKs() },
    });
    const result = await tick(ctx);
    expect(result.lastTickPrice).toBe(50000);
  });

  it('returns null lastTickPrice on outer error when initial value is null', async () => {
    const exchange = mkExchange({
      fetchTicker: vi.fn().mockRejectedValue(new Error('fatal')),
    });
    const ctx = mkCtx({
      lastTickPrice: null,
      deps: { exchange, killswitch: mkKs() },
    });
    const result = await tick(ctx);
    expect(result.lastTickPrice).toBeNull();
  });
});
