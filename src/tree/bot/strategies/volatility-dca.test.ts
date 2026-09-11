import { describe, it, expect, vi } from 'vitest';
import { VolatilityDcaStrategy } from './volatility-dca';
import type { VolatilityDcaBotConfig } from '../types';
import type { Ticker } from '../../exchange/types';

const baseConfig: VolatilityDcaBotConfig = {
  strategy: 'volatility_dca',
  symbol: 'BTC/USDT',
  exchange: 'binance',
  mode: 'paper',
  capital: 10000,
  maxDrawdownPct: 15,
  pair: 'BTC/USDT',
  priceDropStep: 1.0, // 1% drop per step
  maxSteps: 3,
  baseOrderSizePct: 10,
  volatilityWindow: 5, // Small window for fast testing
  volBaseline: 50,
  reboundTarget: 2.0, // 2% rebound to exit
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

describe('VolatilityDcaStrategy', () => {
  it('initializes correctly on start()', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy(baseConfig, { onLog });

    strategy.start(50000);

    expect(strategy.getReferencePrice()).toBe(50000);
    expect(strategy.getStepIndex()).toBe(0);
    expect(strategy.getConfig()).toEqual(baseConfig);
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('VolatilityDCA started'));
  });

  it('stops running on stop()', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy(baseConfig, { onLog });

    strategy.start(50000);
    strategy.stop();

    // After stop, onTicker should be ignored
    strategy.onTicker(makeTicker(49000));
    expect(strategy.getStepIndex()).toBe(0);
    expect(onLog).toHaveBeenCalledWith('VolatilityDCA stopped');
  });

  it('ignores non-positive prices', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy(baseConfig, { onLog });
    strategy.start(50000);

    strategy.onTicker(makeTicker(0));
    strategy.onTicker(makeTicker(-100));

    expect(strategy.getStepIndex()).toBe(0);
  });

  it('accumulates window before triggering signals', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy(baseConfig, { onLog });
    strategy.start(50000);

    // Feed 3 tickers (less than window=5)
    strategy.onTicker(makeTicker(49900));
    strategy.onTicker(makeTicker(49800));
    strategy.onTicker(makeTicker(49700));

    expect(strategy.getStepIndex()).toBe(0);
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('VolatilityDCA accumulating:'));
  });

  it('triggers a buy signal when price drops sufficiently after window fills', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy(baseConfig, { onLog });
    strategy.start(50000);

    // Feed 4 tickers around 50k to fill window
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(49990));
    strategy.onTicker(makeTicker(50010));
    strategy.onTicker(makeTicker(50000));

    // Now drop by 3% (> 1% drop required for step 1)
    strategy.onTicker(makeTicker(48500));

    expect(strategy.getStepIndex()).toBe(1);
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('VolatilityDCA buy step=1'));
  });

  it('triggers a sell signal and resets on rebound target', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy(baseConfig, { onLog });
    strategy.start(50000);

    // Fill window
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(50010));
    strategy.onTicker(makeTicker(49990));
    strategy.onTicker(makeTicker(50000));

    // First buy
    strategy.onTicker(makeTicker(48500));
    expect(strategy.getStepIndex()).toBe(1);

    // Now pump by >2% above reference price (50000 * 1.025 = 51250)
    strategy.onTicker(makeTicker(51500));

    expect(strategy.getStepIndex()).toBe(0);
    expect(strategy.getReferencePrice()).toBe(51500);
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('VolatilityDCA sell:'));
  });

  it('handles hold path when price changes are within thresholds', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy(baseConfig, { onLog });
    strategy.start(50000);

    // Fill window with nearly flat prices
    strategy.onTicker(makeTicker(50000));
    strategy.onTicker(makeTicker(50001));
    strategy.onTicker(makeTicker(49999));
    strategy.onTicker(makeTicker(50000));

    // 0.2% drop is not enough for 1% step
    strategy.onTicker(makeTicker(49900));

    expect(strategy.getStepIndex()).toBe(0);
  });

  it('handles window size of 1 safely (priceWindow length < 2 in vol calc)', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy({ ...baseConfig, volatilityWindow: 1 }, { onLog });
    strategy.start(50000);
    strategy.onTicker(makeTicker(48000));
    expect(strategy.getStepIndex()).toBe(1);
  });

  it('shifts price window when larger than volatilityWindow', () => {
    const onLog = vi.fn();
    const strategy = new VolatilityDcaStrategy(baseConfig, { onLog });
    strategy.start(50000);

    // Feed 10 prices (window is 5)
    for (let i = 0; i < 10; i++) {
      strategy.onTicker(makeTicker(50000 + i * 10));
    }

    // Should still be running smoothly
    expect(strategy.getStepIndex()).toBe(0);
  });
});
