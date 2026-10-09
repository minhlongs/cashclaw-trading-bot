import { describe, expect, it } from 'vitest';
import { computeKyleRosuExecution } from '@/tree/quantlib/execution/kyle-rosu-engine';
import { computeFoucaultRosuMicrostructure } from '@/tree/quantlib/microstructure/foucault-rosu-engine';
import { QueuedExchangeAdapter } from '@/tree/exchange/queue/queued-adapter';
import { RequestQueue } from '@/tree/exchange/queue/request-queue';
import { CircuitStateMachine } from '@/tree/exchange/provider/circuit-breaker-state';
import type { ExchangeAdapter, Ticker, OrderResult } from '@/tree/exchange/types';

describe('Triad v34 Apex Multi-Domain Quantitative & Architecture Suite Simulation', () => {
  it('integrates Kyle-Roşu execution, Foucault-Roşu microstructure, queued adapter & circuit breaker', async () => {
    // 1. Kyle-Roşu high-frequency informed trading execution
    const exec = computeKyleRosuExecution({
      fundamentalValue: 105,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 4,
      volatility: 0.02,
      noiseTraderStd: 0.04,
      aggressivenessCoeff: 1.5,
      temporaryImpactCoeff: 0.002,
      initialInventory: 800,
    });
    expect(exec.terminalInventory).toBe(0);
    expect(exec.trajectory.length).toBe(4);
    expect(exec.vwapPrice).toBeGreaterThan(100);
    expect(exec.priceDiscoveryEfficiency).toBeGreaterThan(0);

    // 2. Foucault-Roşu fast-trader microstructure
    const micro = computeFoucaultRosuMicrostructure({
      fastTraderArrivalRate: 60,
      cancelRateSlowTraders: 30,
      fundamentalVolatility: 0.025,
      baseAssetPrice: 100,
      tickSize: 0.01,
      inventoryHoldingCost: 0.005,
    });
    expect(micro.snipingProbability).toBeCloseTo(60 / 90, 4);
    expect(micro.equilibriumSpreadBps).toBeGreaterThan(0);
    expect(micro.fastTraderRentBps).toBeGreaterThan(0);
    expect(micro.adverseSelectionShare).toBeGreaterThan(0);

    // 3. Queued exchange adapter modularized flow
    const fakeTicker: Ticker = {
      symbol: 'BTC/USDT',
      bid: 50000,
      ask: 50010,
      last: 50005,
      high24h: 51000,
      low24h: 49000,
      volume24h: 1000,
      timestamp: Date.now(),
    };
    const fakeOrderResult: OrderResult = {
      id: 'order-1',
      exchangeId: 'binance',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      quantity: 0.1,
      filled: 0,
      status: 'open',
      fee: 0,
      feeCurrency: 'USDT',
      timestamp: Date.now(),
      pnl: 0,
    };
    const mockInner: ExchangeAdapter = {
      id: 'binance',
      name: 'Binance Mock',
      fetchTicker: async () => fakeTicker,
      fetchOrderBook: async () => ({ symbol: 'BTC/USDT', bids: [], asks: [], timestamp: Date.now() }),
      fetchBalances: async () => [],
      placeOrder: async () => fakeOrderResult,
      cancelOrder: async () => true,
      fetchOrder: async () => fakeOrderResult,
      fetchOpenOrders: async () => [],
      ping: async () => true,
      getServerTime: async () => Date.now(),
    };
    const queue = new RequestQueue({
      maxDepth: { binance: 10, bybit: 10, okx: 10 },
      dailyBudget: { binance: 1000, bybit: 1000, okx: 1000 },
      drainBatchSize: 20,
    });
    const queuedAdapter = new QueuedExchangeAdapter({ inner: mockInner, queue });
    const fetched = await queuedAdapter.fetchTicker('BTC/USDT');
    expect(fetched.symbol).toBe('BTC/USDT');
    expect(fetched.last).toBe(50005);

    // 4. Circuit state machine modularized flow
    const sm = new CircuitStateMachine(1000, 2000);
    expect(sm.getState()).toBe('closed');
    sm.recordFailure('rate_limit', 3);
    sm.recordFailure('rate_limit', 3);
    const trans = sm.recordFailure('rate_limit', 3);
    expect(trans?.to).toBe('degraded');
    expect(sm.getState()).toBe('degraded');
    sm.recordSuccess();
    expect(sm.getState()).toBe('closed');
  });
});
