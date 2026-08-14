import { describe, it, expect } from 'vitest';
import {
  computeGridLevels,
  updateTrailingLevels,
  findTrailingExits,
  computeDeployedCapital,
} from './grid-levels';
import type { GridLevel, GridBotConfig } from '../types';

const cfg: GridBotConfig = {
  symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 10_000,
  maxDrawdownPct: 10, strategy: 'grid', gridSpacingPct: 2, gridLevels: 6,
  capitalPerLevelPct: 10, takeProfitPct: 3, stopLossPct: 5, rebalanceOnFill: false,
};

const mkLevel = (o: Partial<GridLevel> = {}): GridLevel => ({
  level: 1, side: 'buy', triggerPrice: 49_000, quantity: 0.002,
  status: 'filled', takeProfitPrice: 50_470, stopLossPrice: 46_550,
  filledPrice: 49_000, orderId: 'ord-1', ...o,
});

describe('computeGridLevels', () => {
  const levels = computeGridLevels(50_000, cfg);

  it('produces gridLevels levels (skips center offset)', () => {
    expect(levels).toHaveLength(cfg.gridLevels);
  });

  it('sorts descending by triggerPrice', () => {
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i - 1].triggerPrice).toBeGreaterThanOrEqual(levels[i].triggerPrice);
    }
  });

  it('assigns buy below center and sell above center', () => {
    const sells = levels.filter((l) => l.side === 'sell');
    const buys  = levels.filter((l) => l.side === 'buy');
    expect(sells.length).toBeGreaterThan(0);
    expect(buys.length).toBeGreaterThan(0);
    sells.forEach((l) => expect(l.triggerPrice).toBeGreaterThan(50_000));
    buys.forEach((l)  => expect(l.triggerPrice).toBeLessThan(50_000));
  });

  it('computes TP and SL prices from config percentages', () => {
    const buy  = levels.find((l) => l.side === 'buy')!;
    const sell = levels.find((l) => l.side === 'sell')!;
    expect(buy.takeProfitPrice).toBeCloseTo(buy.triggerPrice * 1.03, 2);
    expect(buy.stopLossPrice).toBeCloseTo(buy.triggerPrice * 0.95, 2);
    expect(sell.takeProfitPrice).toBeCloseTo(sell.triggerPrice * 0.97, 2);
    expect(sell.stopLossPrice).toBeCloseTo(sell.triggerPrice * 1.05, 2);
  });

  it('sets quantity = levelCapital / triggerPrice', () => {
    const capital = cfg.capital * (cfg.capitalPerLevelPct / 100);
    levels.forEach((l) => expect(l.quantity).toBeCloseTo(capital / l.triggerPrice, 8));
  });

  it('starts all levels as pending with null orderId', () => {
    levels.forEach((l) => {
      expect(l.status).toBe('pending');
      expect(l.orderId).toBeNull();
    });
  });

  it('clamps near-zero trigger prices to minimum', () => {
    const tiny = computeGridLevels(0.00000005, { ...cfg, gridSpacingPct: 1, gridLevels: 8, capitalPerLevelPct: 50 });
    expect(tiny.length).toBeGreaterThan(0);
    tiny.forEach((l) => expect(l.triggerPrice).toBeGreaterThanOrEqual(0.00000001));
  });
});

describe('updateTrailingLevels', () => {
  it('skips non-filled levels', () => {
    const lvl = mkLevel({ status: 'pending', filledPrice: undefined });
    updateTrailingLevels([lvl], 50_000, 3, 5);
    expect(lvl.trailingActive).toBeUndefined();
  });

  it('seeds trailing state on first call', () => {
    const lvl = mkLevel({ filledPrice: 49_000, side: 'buy' });
    updateTrailingLevels([lvl], 49_000, 3, 5);
    expect(lvl.trailingActive).toBe(true);
    expect(lvl.trailingSkipExit).toBe(true);
    expect(lvl.currentTpPrice).toBeCloseTo(49_000 * 1.03, 2);
    expect(lvl.currentSlPrice).toBeCloseTo(49_000 - 49_000 * 0.05 * 2, 2);
  });

  it('ratchets TP upward for buy when price rises', () => {
    const lvl = mkLevel({ filledPrice: 49_000, side: 'buy' });
    updateTrailingLevels([lvl], 49_000, 3, 5);
    const tp0 = lvl.currentTpPrice!;
    // tpOff=1470; ratchet needs price > 49_000 + 2*1470 = 51_940
    updateTrailingLevels([lvl], 52_000, 3, 5);
    expect(lvl.currentTpPrice).toBeGreaterThan(tp0);
  });

  it('ratchets TP downward for sell when price drops', () => {
    const lvl = mkLevel({ filledPrice: 51_000, side: 'sell', triggerPrice: 51_000 });
    updateTrailingLevels([lvl], 51_000, 3, 5);
    const tp0 = lvl.currentTpPrice!;
    // tpOff=1530; ratchet needs price < 51_000 - 2*1530 = 47_940
    updateTrailingLevels([lvl], 47_000, 3, 5);
    expect(lvl.currentTpPrice).toBeLessThan(tp0);
  });

  it('never moves TP backward', () => {
    const lvl = mkLevel({ filledPrice: 49_000, side: 'buy' });
    updateTrailingLevels([lvl], 52_000, 3, 5);
    const tp0 = lvl.currentTpPrice!;
    updateTrailingLevels([lvl], 50_000, 3, 5);
    expect(lvl.currentTpPrice).toBe(tp0);
  });
});

describe('findTrailingExits', () => {
  const buyTp: Partial<GridLevel> = { trailingActive: true, trailingSkipExit: false, currentTpPrice: 50_470, currentSlPrice: 46_550 };

  it('clears trailingSkipExit flag without triggering exit', () => {
    const lvl = mkLevel({ ...buyTp, trailingSkipExit: true });
    expect(findTrailingExits([lvl], 60_000)).toHaveLength(0);
    expect(lvl.trailingSkipExit).toBe(false);
  });

  it('triggers TP on buy when price >= currentTpPrice', () => {
    const [c] = findTrailingExits([mkLevel({ ...buyTp })], 51_000);
    expect(c).toBeDefined();
    expect(c.reason).toBe('take-profit');
    expect(c.closePrice).toBe(51_000);
  });

  it('triggers SL on buy when price <= currentSlPrice', () => {
    const [c] = findTrailingExits([mkLevel({ ...buyTp })], 46_000);
    expect(c).toBeDefined();
    expect(c.reason).toBe('stop-loss');
  });

  it('triggers TP on sell when price <= currentTpPrice', () => {
    const sellLvl = mkLevel({
      side: 'sell', triggerPrice: 51_000, filledPrice: 51_000,
      trailingActive: true, trailingSkipExit: false, currentTpPrice: 49_470, currentSlPrice: 53_550,
    });
    const [c] = findTrailingExits([sellLvl], 49_000);
    expect(c).toBeDefined();
    expect(c.reason).toBe('take-profit');
  });

  it('triggers SL on sell when price >= currentSlPrice', () => {
    const sellLvl = mkLevel({
      side: 'sell', triggerPrice: 51_000, filledPrice: 51_000,
      trailingActive: true, trailingSkipExit: false, currentTpPrice: 49_470, currentSlPrice: 53_550,
    });
    const [c] = findTrailingExits([sellLvl], 54_000);
    expect(c).toBeDefined();
    expect(c.reason).toBe('stop-loss');
  });

  it('ignores non-filled and non-trailing-active levels', () => {
    expect(findTrailingExits([mkLevel({ status: 'open', trailingActive: true })], 60_000)).toHaveLength(0);
    expect(findTrailingExits([mkLevel({ trailingActive: false })], 60_000)).toHaveLength(0);
  });

  it('returns no exit when price is between TP and SL', () => {
    expect(findTrailingExits([mkLevel({ ...buyTp })], 48_000)).toHaveLength(0);
  });
});

describe('computeDeployedCapital', () => {
  it('sums quantity * triggerPrice for open and filled levels', () => {
    const levels: GridLevel[] = [
      mkLevel({ status: 'filled', quantity: 0.002, triggerPrice: 49_000 }),
      mkLevel({ status: 'open', quantity: 0.001, side: 'sell', triggerPrice: 51_000 }),
    ];
    expect(computeDeployedCapital(levels)).toBeCloseTo(0.002 * 49_000 + 0.001 * 51_000, 6);
  });

  it('returns 0 for pending/cancelled levels and empty array', () => {
    const levels: GridLevel[] = [
      mkLevel({ status: 'pending', quantity: 0.002, triggerPrice: 49_000 }),
      mkLevel({ status: 'cancelled', quantity: 0.001, triggerPrice: 51_000 }),
    ];
    expect(computeDeployedCapital(levels)).toBe(0);
    expect(computeDeployedCapital([])).toBe(0);
  });
});
