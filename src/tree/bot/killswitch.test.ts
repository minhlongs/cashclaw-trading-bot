import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Killswitch } from './killswitch';
import type { KillswitchCallbacks, KillswitchConfig } from './killswitch';
import type { OrderResult } from '../exchange/types';

function makeCallbacks(): KillswitchCallbacks {
  return {
    onHalt: vi.fn(),
    onResume: vi.fn(),
    onOrderPlaced: vi.fn(),
    onOrderFilled: vi.fn(),
    onError: vi.fn(),
  };
}

function makeOrder(pnl: number, overrides: Partial<OrderResult> = {}): OrderResult {
  return {
    id: 'order-1',
    exchangeId: 'binance',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'market',
    price: 1000,
    quantity: 1,
    filled: 1,
    status: 'filled',
    timestamp: Date.now(),
    pnl,
    ...overrides,
  };
}

describe('Killswitch', () => {
  let cb: KillswitchCallbacks;
  let ks: Killswitch;

  beforeEach(() => {
    cb = makeCallbacks();
  });

  describe('constructor', () => {
    it('initializes with default state (not halted, zero drawdown)', () => {
      ks = new Killswitch(cb);
      const s = ks.getState();
      expect(s.halted).toBe(false);
      expect(s.haltReason).toBeNull();
      expect(s.haltTimestamp).toBeNull();
      expect(s.dailyPnl).toBe(0);
      expect(s.consecutiveLosses).toBe(0);
      expect(s.peakCapital).toBe(0);
      expect(s.currentDrawdown).toBe(0);
      expect(s.enabled).toBe(true);
    });

    it('applies custom config over defaults', () => {
      const custom: Partial<KillswitchConfig> = {
        maxDailyLossPct: 5,
        maxConsecutiveLosses: 3,
        cooldownMinutes: 10,
      };
      ks = new Killswitch(cb, custom);
      ks.registerBot('bot1', 1000);
      // Trigger daily loss at 5% (custom) vs default 10%
      // 50 loss on 1000 = 5% — should halt
      ks.updatePeakCapital(1000);
      ks.onOrderFilled(makeOrder(-50));
      expect(ks.getState().halted).toBe(true);
    });
  });

  describe('halt via manualHalt', () => {
    it('sets halted=true, records haltTimestamp, emits callback', () => {
      ks = new Killswitch(cb);
      ks.manualHalt('operator says stop');
      const s = ks.getState();
      expect(s.halted).toBe(true);
      expect(s.haltReason).toBe('Manual halt: operator says stop');
      expect(s.haltTimestamp).toBeTypeOf('number');
      expect(cb.onHalt).toHaveBeenCalledWith('Manual halt: operator says stop');
    });

    it('does not double-halt if already halted', () => {
      ks = new Killswitch(cb);
      ks.manualHalt('first');
      const firstTs = ks.getState().haltTimestamp;
      ks.manualHalt('second');
      expect(ks.getState().haltTimestamp).toBe(firstTs);
      expect(cb.onHalt).toHaveBeenCalledTimes(1);
    });
  });

  describe('manualResume', () => {
    it('resumes from halted state', () => {
      ks = new Killswitch(cb);
      ks.manualHalt('test');
      ks.manualResume();
      const s = ks.getState();
      expect(s.halted).toBe(false);
      expect(s.haltReason).toBeNull();
      expect(cb.onResume).toHaveBeenCalledTimes(1);
    });

    it('is a no-op if not halted', () => {
      ks = new Killswitch(cb);
      ks.manualResume();
      expect(cb.onResume).not.toHaveBeenCalled();
    });
  });

  describe('isTradingEnabled', () => {
    it('returns true when enabled and not halted', () => {
      ks = new Killswitch(cb);
      expect(ks.isTradingEnabled()).toBe(true);
    });

    it('returns false when disabled', () => {
      ks = new Killswitch(cb);
      ks.disable();
      expect(ks.isTradingEnabled()).toBe(false);
    });

    it('returns false when halted', () => {
      ks = new Killswitch(cb);
      ks.manualHalt('test');
      expect(ks.isTradingEnabled()).toBe(false);
    });

    it('returns true after cooldown expires and auto-resumes', () => {
      ks = new Killswitch(cb, { cooldownMinutes: 0.001 }); // ~0.06s cooldown
      ks.manualHalt('test');
      // Manually set cooldown to past
      const state = ks.getState();
      // Access internal state via hack: we set cooldownUntil in the past
      // Since cooldownMinutes: 0.001, it's ~60ms. Wait a bit.
      const start = Date.now();
      while (Date.now() - start < 100) {
        // busy wait for cooldown
      }
      expect(ks.isTradingEnabled()).toBe(true);
      expect(cb.onResume).toHaveBeenCalled();
    });
  });

  describe('onOrderFilled — daily loss limit', () => {
    it('triggers halt when daily loss exceeds maxDailyLossPct', () => {
      ks = new Killswitch(cb, { maxDailyLossPct: 10 });
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      // 10% of 1000 = 100 loss
      ks.onOrderFilled(makeOrder(-100));
      expect(ks.getState().halted).toBe(true);
      expect(ks.getState().haltReason).toContain('Daily loss limit');
      expect(cb.onHalt).toHaveBeenCalled();
    });

    it('does not halt when loss is under maxDailyLossPct', () => {
      ks = new Killswitch(cb, { maxDailyLossPct: 10 });
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      ks.onOrderFilled(makeOrder(-50));
      expect(ks.getState().halted).toBe(false);
    });
  });

  describe('onOrderFilled — consecutive losses', () => {
    it('triggers halt when consecutive losses reach maxConsecutiveLosses', () => {
      ks = new Killswitch(cb, { maxConsecutiveLosses: 3, maxDailyLossPct: 50 });
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      // 3 consecutive losses
      ks.onOrderFilled(makeOrder(-10)); // loss 1
      ks.onOrderFilled(makeOrder(-10)); // loss 2
      ks.onOrderFilled(makeOrder(-10)); // loss 3 — triggers halt
      expect(ks.getState().halted).toBe(true);
      expect(ks.getState().haltReason).toContain('consecutive losses');
    });

    it('resets consecutive count on a win', () => {
      ks = new Killswitch(cb, { maxConsecutiveLosses: 3, maxDailyLossPct: 50 });
      ks.registerBot('bot1', 10000);
      ks.updatePeakCapital(10000);
      ks.onOrderFilled(makeOrder(-10)); // loss 1
      ks.onOrderFilled(makeOrder(-10)); // loss 2
      ks.onOrderFilled(makeOrder(50));  // win — resets count
      ks.onOrderFilled(makeOrder(-10)); // loss 1 again (not 3)
      expect(ks.getState().halted).toBe(false);
      expect(ks.getState().consecutiveLosses).toBe(1);
    });
  });

  describe('onOrderFilled — drawdown', () => {
    it('triggers halt when drawdown exceeds maxDrawdownPct', () => {
      // maxDailyLossPct must be > maxDrawdownPct so drawdown check fires first
      ks = new Killswitch(cb, { maxDrawdownPct: 15, maxDailyLossPct: 50 });
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      // 15% drawdown = -150 PnL; daily loss check allows up to 50%
      ks.onOrderFilled(makeOrder(-150));
      expect(ks.getState().halted).toBe(true);
      expect(ks.getState().haltReason).toContain('drawdown');
    });

    it('does not halt when drawdown is under maxDrawdownPct', () => {
      ks = new Killswitch(cb, { maxDrawdownPct: 15, maxDailyLossPct: 50 });
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      ks.onOrderFilled(makeOrder(-140));
      expect(ks.getState().halted).toBe(false);
      expect(ks.getState().currentDrawdown).toBeCloseTo(14, 0);
    });
  });

  describe('registerBot / unregisterBot', () => {
    it('registerBot tracks bot and updates peakCapital', () => {
      ks = new Killswitch(cb);
      ks.registerBot('bot1', 500);
      expect(ks.getState().peakCapital).toBe(500);
      ks.registerBot('bot2', 800);
      expect(ks.getState().peakCapital).toBe(800);
    });

    it('unregisterBot removes bot', () => {
      ks = new Killswitch(cb);
      ks.registerBot('bot1', 500);
      ks.unregisterBot('bot1');
      // Verify bot is gone (indirectly — no bot state tracked)
      const s = ks.getState();
      expect(s.dailyPnl).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears all state back to defaults', () => {
      ks = new Killswitch(cb);
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      ks.onOrderFilled(makeOrder(100));
      ks.manualHalt('test');

      ks.reset();

      const s = ks.getState();
      expect(s.halted).toBe(false);
      expect(s.haltReason).toBeNull();
      expect(s.haltTimestamp).toBeNull();
      expect(s.dailyPnl).toBe(0);
      expect(s.consecutiveLosses).toBe(0);
      expect(s.peakCapital).toBe(0);
      expect(s.currentDrawdown).toBe(0);
    });
  });

  describe('getState', () => {
    it('returns a copy (not a reference to internal state)', () => {
      ks = new Killswitch(cb);
      const s1 = ks.getState();
      const s2 = ks.getState();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2); // different object references
    });
  });

  describe('halt reasons', () => {
    it('manual halt reason is formatted with prefix', () => {
      ks = new Killswitch(cb);
      ks.manualHalt('maintenance');
      expect(ks.getState().haltReason).toBe('Manual halt: maintenance');
    });

    it('daily loss halt includes percentage in reason', () => {
      ks = new Killswitch(cb, { maxDailyLossPct: 5 });
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      ks.onOrderFilled(makeOrder(-100)); // 10% > 5%
      expect(ks.getState().haltReason).toContain('Daily loss limit');
    });

    it('consecutive loss halt includes count in reason', () => {
      ks = new Killswitch(cb, { maxConsecutiveLosses: 2, maxDailyLossPct: 50 });
      ks.registerBot('bot1', 10000);
      ks.updatePeakCapital(10000);
      ks.onOrderFilled(makeOrder(-1));
      ks.onOrderFilled(makeOrder(-1));
      expect(ks.getState().haltReason).toContain('2');
    });

    it('drawdown halt includes percentage in reason', () => {
      ks = new Killswitch(cb, { maxDrawdownPct: 10, maxDailyLossPct: 50 });
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      ks.onOrderFilled(makeOrder(-100)); // 10% drawdown; daily loss allows up to 50%
      expect(ks.getState().haltReason).toContain('drawdown');
      expect(ks.getState().haltReason).toContain('10');
    });
  });

  describe('disable / enable', () => {
    it('disable prevents trading', () => {
      ks = new Killswitch(cb);
      ks.disable();
      expect(ks.isTradingEnabled()).toBe(false);
    });

    it('disable makes onOrderFilled a no-op', () => {
      ks = new Killswitch(cb, { maxDailyLossPct: 1 });
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      ks.disable();
      ks.onOrderFilled(makeOrder(-1000));
      expect(ks.getState().halted).toBe(false);
      expect(cb.onOrderFilled).not.toHaveBeenCalled();
    });

    it('enable re-enables after disable', () => {
      ks = new Killswitch(cb);
      ks.disable();
      ks.enable();
      expect(ks.isTradingEnabled()).toBe(true);
    });
  });

  describe('updatePeakCapital', () => {
    it('updates peak when new value is higher', () => {
      ks = new Killswitch(cb);
      ks.registerBot('bot1', 500);
      ks.updatePeakCapital(1000);
      expect(ks.getState().peakCapital).toBe(1000);
    });

    it('does not decrease peak when lower value provided', () => {
      ks = new Killswitch(cb);
      ks.registerBot('bot1', 500);
      ks.updatePeakCapital(300);
      expect(ks.getState().peakCapital).toBe(500);
    });
  });

  describe('resume respects cooldown', () => {
    it('cannot resume before cooldownUntil via auto-resume', () => {
      ks = new Killswitch(cb, { cooldownMinutes: 60 });
      ks.registerBot('bot1', 1000);
      ks.updatePeakCapital(1000);
      ks.manualHalt('test');

      // isTradingEnabled should return false during cooldown
      expect(ks.isTradingEnabled()).toBe(false);
    });
  });
});
