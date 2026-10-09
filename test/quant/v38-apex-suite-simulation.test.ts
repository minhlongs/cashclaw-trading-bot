import { describe, it, expect } from 'vitest';
import { computeBouchaudFarmerExecution } from '@/tree/quantlib/execution/bouchaud-farmer-engine';
import { computeFoucaultKadanOrderBook } from '@/tree/quantlib/microstructure/foucault-kadan-engine';
import { BotScheduler } from '@/forest/bot/scheduler';
import { executeOrder, orderResultToTrade } from '@/tree/bot/bot-order-executor';
import type { OrderContext } from '@/tree/bot/bot-order-executor';
import type { OrderRequest, OrderResult, ExchangeAdapter } from '@/tree/exchange/types';
import type { BotState, GridBotConfig } from '@/tree/bot/types';
import type { Killswitch } from '@/tree/bot/killswitch';

describe('Triad v38 Apex Multi-Domain Suite Cross-Domain Simulation', () => {
  it('seamlessly integrates long-memory execution with LOB waiting-time decisioning and bot execution', async () => {
    // 1. Evaluate LOB queue & waiting time equilibrium
    const lobDecision = computeFoucaultKadanOrderBook({
      queueDepth: 8,
      marketOrderArrivalRate: 1.5,
      traderImpatienceCost: 0.005,
      tickSize: 0.01,
      volatility: 0.08,
      timeLimitSec: 20,
    });

    expect(lobDecision.expectedWaitTimeSec).toBeCloseTo(6.0, 4);
    expect(lobDecision.fillProbability).toBeGreaterThan(0.8);

    // 2. Schedule execution based on order flow memory
    const execPlan = computeBouchaudFarmerExecution({
      initialShares: 200,
      initialPrice: 50.0,
      numTrades: 4,
      memoryDecayExponent: 0.5,
      bareImpactMagnitude: 0.01,
      tradeSign: lobDecision.optimalOrderType === 'LIMIT' ? -1 : 1,
    });

    expect(execPlan.trajectory.length).toBe(4);
    expect(execPlan.hurstExponent).toBe(0.75);
    expect(execPlan.vwapPrice).toBeGreaterThan(0);

    // 3. Test modular bot execution workflow
    const mockConfig: GridBotConfig = {
      name: 'TestBot',
      strategy: 'grid',
      symbol: 'SOL/USDT',
      capital: 10000,
      exchange: 'paper',
      mode: 'paper',
      maxDrawdownPct: 15,
      gridSpacingPct: 1.0,
      gridLevels: 5,
      capitalPerLevelPct: 20,
      takeProfitPct: 2.0,
      stopLossPct: 5.0,
      rebalanceOnFill: true,
    };

    const mockState: BotState = {
      id: 'bot_test_38',
      config: mockConfig,
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
      lastTickAt: Date.now(),
      lastOrderAt: null,
      updatedAt: Date.now(),
    };

    const mockKillswitch = {
      isTradingEnabled: () => true,
      onOrderFilled: () => {},
      updateDailyPnl: () => {},
      updatePeakCapital: () => {},
    } as unknown as Killswitch;

    const mockExchange = {
      placeOrder: async (req: OrderRequest): Promise<OrderResult> => ({
        id: 'ord_123',
        exchangeId: 'paper',
        symbol: req.symbol,
        side: req.side,
        type: req.type,
        price: req.price ?? 50.0,
        quantity: req.quantity,
        filled: req.quantity,
        fee: 0.05,
        pnl: 1.5,
        status: 'filled',
        timestamp: Date.now(),
      }),
    } as unknown as ExchangeAdapter;

    const trades: ReturnType<typeof orderResultToTrade>[] = [];
    const ctx: OrderContext = {
      deps: {
        exchange: mockExchange,
        killswitch: mockKillswitch,
      },
      config: { capital: 10000, symbol: 'SOL/USDT' },
      state: mockState,
      botId: 'bot_test_38',
      onTrade: (t) => trades.push(t),
      emitTelemetry: () => {},
      emitState: () => {},
    };

    const { result, orderCounter } = await executeOrder(
      ctx,
      { symbol: 'SOL/USDT', side: 'buy', type: 'market', quantity: 5 },
      0,
    );

    expect(orderCounter).toBe(1);
    expect(result.id).toBe('ord_123');
    expect(mockState.totalTrades).toBe(1);
    expect(mockState.totalPnl).toBe(1.5);
    expect(trades.length).toBe(1);

    // 4. Test BotScheduler instantiation & stats
    const scheduler = new BotScheduler();
    expect(scheduler.getStats().tickCount).toBe(0);
  });
});
