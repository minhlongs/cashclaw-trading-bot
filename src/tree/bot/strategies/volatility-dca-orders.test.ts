import { describe, it, expect, vi } from 'vitest';
import { VolatilityDcaStrategy } from './volatility-dca';
import type { VolatilityDcaBotConfig } from '../types';
import type { Ticker } from '../../exchange/types';

const testConfig: VolatilityDcaBotConfig = {
  strategy: 'volatility_dca',
  symbol: 'BTC/USDT',
  exchange: 'binance',
  mode: 'paper',
  capital: 10000,
  maxDrawdownPct: 15,
  pair: 'BTC/USDT',
  priceDropStep: 1.0,
  maxSteps: 3,
  baseOrderSizePct: 10,
  volatilityWindow: 3,
  volBaseline: 50,
  reboundTarget: 2.0,
};

function makeTicker(price: number): Ticker {
  return {
    symbol: 'BTC/USDT',
    last: price,
    bid: price - 0.5,
    ask: price + 0.5,
    high24h: price * 1.05,
    low24h: price * 0.95,
    volume24h: 1000,
    timestamp: Date.now(),
  };
}

describe('VolatilityDcaStrategy - Order Placement & Position Tracking', () => {
  it('dispatches limit buy order when placeOrder is provided', async () => {
    const onLog = vi.fn();
    const placeOrder = vi.fn().mockResolvedValue({ id: 'ord-1', status: 'filled' });
    const strategy = new VolatilityDcaStrategy(testConfig, { onLog, placeOrder });
    strategy.start(50000);

    expect(strategy.getPositionQty()).toBe(0);
    expect(strategy.getPositionCost()).toBe(0);

    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(48500));

    await vi.waitFor(() => {
      expect(placeOrder).toHaveBeenCalledWith({
        symbol: 'BTC/USDT',
        exchange: 'binance',
        side: 'buy',
        type: 'limit',
        price: 48500,
        quantity: 1000 / 48500,
        timeInForce: 'GTC',
      });
    });

    expect(strategy.getStepIndex()).toBe(1);
    expect(strategy.getPositionQty()).toBeCloseTo(1000 / 48500, 6);
    expect(strategy.getPositionCost()).toBe(1000);
  });

  it('handles buy order rejection with Error and non-Error', async () => {
    const onLog = vi.fn();
    const placeOrder = vi.fn().mockRejectedValueOnce(new Error('Network error'));
    const strategy = new VolatilityDcaStrategy(testConfig, { onLog, placeOrder });
    strategy.start(50000);

    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(48500));

    await vi.waitFor(() => {
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('VolatilityDCA buy order failed: Network error'));
    });

    placeOrder.mockRejectedValueOnce('raw string error');
    strategy.onTicker(makeTicker(47000));

    await vi.waitFor(() => {
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('VolatilityDCA buy order failed: unknown'));
    });
  });

  it('executes buy without order when placeOrder is undefined', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy(testConfig, { onLog });
    strategy.start(50000);

    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(48500));

    expect(strategy.getStepIndex()).toBe(1);
    expect(strategy.getPositionQty()).toBeGreaterThan(0);
    expect(strategy.getPositionCost()).toBe(1000);
  });

  it('dispatches limit sell order on rebound when position exists', async () => {
    const onLog = vi.fn();
    const placeOrder = vi.fn().mockResolvedValue({ id: 'ord-2', status: 'filled' });
    const onTrade = vi.fn();
    const strategy = new VolatilityDcaStrategy(testConfig, { onLog, placeOrder, onTrade });
    strategy.start(50000);

    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(48500));

    const expectedQty = 1000 / 48500;
    expect(strategy.getPositionQty()).toBeCloseTo(expectedQty, 6);

    strategy.onTicker(makeTicker(52000));

    await vi.waitFor(() => {
      expect(placeOrder).toHaveBeenCalledWith({
        symbol: 'BTC/USDT',
        exchange: 'binance',
        side: 'sell',
        type: 'limit',
        price: 52000,
        quantity: expectedQty,
        timeInForce: 'GTC',
      });
    });

    expect(strategy.getPositionQty()).toBe(0);
    expect(strategy.getPositionCost()).toBe(0);
    expect(strategy.getStepIndex()).toBe(0);
    expect(strategy.getReferencePrice()).toBe(52000);
  });

  it('handles sell order rejection with Error and non-Error', async () => {
    const onLog = vi.fn();
    const placeOrder = vi.fn()
      .mockResolvedValueOnce({ id: 'buy-1', status: 'filled' })
      .mockRejectedValueOnce(new Error('Sell failed'));
    const strategy = new VolatilityDcaStrategy(testConfig, { onLog, placeOrder });
    strategy.start(50000);

    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(48500));
    strategy.onTicker(makeTicker(52000));

    await vi.waitFor(() => {
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('VolatilityDCA sell order failed: Sell failed'));
    });

    // Test non-Error sell rejection on fresh instance
    const onLog2 = vi.fn();
    const placeOrder2 = vi.fn()
      .mockResolvedValueOnce({ id: 'buy-2', status: 'filled' })
      .mockRejectedValueOnce('raw sell error');
    const strategy2 = new VolatilityDcaStrategy(testConfig, { onLog: onLog2, placeOrder: placeOrder2 });
    strategy2.start(50000);

    strategy2.onTicker(makeTicker(50000));
    strategy2.onTicker(makeTicker(50000));
    strategy2.onTicker(makeTicker(48500));
    strategy2.onTicker(makeTicker(52000));

    await vi.waitFor(() => {
      expect(onLog2).toHaveBeenCalledWith(expect.stringContaining('VolatilityDCA sell order failed: unknown'));
    });
  });

  it('handles sell signal when positionQty is 0 without placing order', () => {
    const onLog = vi.fn();
    const placeOrder = vi.fn();
    const strategy = new VolatilityDcaStrategy(testConfig, { onLog, placeOrder });
    strategy.start(50000);

    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(52000));

    expect(placeOrder).not.toHaveBeenCalled();
    expect(strategy.getPositionQty()).toBe(0);
    expect(strategy.getReferencePrice()).toBe(52000);
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('VolatilityDCA sell: price=52000 ref=52000 resetting (no position)'));
  });

  it('resets positionQty and positionCost on start()', () => {
    const strategy = new VolatilityDcaStrategy(testConfig, { onLog: vi.fn() });
    strategy.start(50000);
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(48500));
    expect(strategy.getPositionQty()).toBeGreaterThan(0);

    strategy.start(49000);
    expect(strategy.getPositionQty()).toBe(0);
    expect(strategy.getPositionCost()).toBe(0);
  });
});
