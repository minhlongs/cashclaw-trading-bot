import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Killswitch } from './killswitch';

function makeCallbacks() {
  return {
    onHalt: vi.fn(),
    onResume: vi.fn(),
    onError: vi.fn(),
    onOrderFilled: vi.fn(),
    onOrderPlaced: vi.fn(),
  };
}

describe('Killswitch', () => {
  let ks: Killswitch;
  let callbacks: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));
    callbacks = makeCallbacks();
    ks = new Killswitch(callbacks, { cooldownMinutes: 5 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('is enabled and not halted', () => {
      expect(ks.isTradingEnabled()).toBe(true);
      expect(ks.isHalted()).toBe(false);
      expect(ks.haltReason).toBeNull();
    });

    it('returns default config values', () => {
      const defaultKs = new Killswitch(makeCallbacks());
      expect(defaultKs.isTradingEnabled()).toBe(true);
    });
  });

  describe('manualHalt / manualResume', () => {
    it('halts with reason', () => {
      ks.manualHalt('operator pause');
      expect(ks.isHalted()).toBe(true);
      expect(ks.getHaltReason()).toBe('Manual halt: operator pause');
      expect(callbacks.onHalt).toHaveBeenCalledWith('Manual halt: operator pause');
    });

    it('prevents trading when halted', () => {
      ks.manualHalt('test');
      expect(ks.isTradingEnabled()).toBe(false);
    });

    it('manualResume clears halt', () => {
      ks.manualHalt('test');
      ks.manualResume();
      expect(ks.isHalted()).toBe(false);
      expect(callbacks.onResume).toHaveBeenCalled();
    });

    it('manualResume is no-op when not halted', () => {
      ks.manualResume(); // should not throw
      expect(callbacks.onResume).not.toHaveBeenCalled();
    });

    it('isManualHalt returns true only for manual halts', () => {
      ks.manualHalt('test');
      expect(ks.isManualHalt()).toBe(true);
    });
  });

  describe('disable / enable', () => {
    it('disable prevents trading', () => {
      ks.disable();
      expect(ks.isTradingEnabled()).toBe(false);
    });

    it('enable re-enables trading', () => {
      ks.disable();
      ks.enable();
      expect(ks.isTradingEnabled()).toBe(true);
    });

    it('enable clears halt state', () => {
      ks.manualHalt('test');
      ks.enable();
      expect(ks.isHalted()).toBe(false);
    });
  });

  describe('onOrderFilled — consecutive losses', () => {
    it('halts after max consecutive losses', () => {
      ks.registerBot('b1', 10000);
      for (let i = 0; i < 5; i++) {
        ks.onOrderFilled({ id: `o${i}`, pnl: -10 });
      }
      expect(ks.isHalted()).toBe(true);
      expect(ks.getHaltReason()).toContain('Max consecutive losses');
      expect(callbacks.onHalt).toHaveBeenCalled();
    });

    it('resets consecutive losses on profit', () => {
      ks.registerBot('b1', 10000);
      ks.onOrderFilled({ id: 'o1', pnl: -10 });
      ks.onOrderFilled({ id: 'o2', pnl: -10 });
      ks.onOrderFilled({ id: 'o3', pnl: 50 });
      ks.onOrderFilled({ id: 'o4', pnl: -10 });
      // Only 1 consecutive loss after the profit
      expect(ks.isHalted()).toBe(false);
    });
  });

  describe('onOrderFilled — daily loss limit', () => {
    it('halts when daily loss exceeds percentage', () => {
      ks.registerBot('b1', 10000);
      ks.onOrderFilled({ id: 'o1', pnl: -1100 }); // 11% of 10000
      expect(ks.isHalted()).toBe(true);
      expect(ks.getHaltReason()).toContain('Daily loss limit');
    });
  });

  describe('onOrderFilled — drawdown', () => {
    it('halts when drawdown exceeds limit', () => {
      // peakCapital=100k, maxDailyLossPct=10%, maxDrawdownPct=15%
      // Two orders: daily PnL cumulative = -14000 (14% > 10% daily limit) but drawdown = 14% (< 15%)
      // Need drawdown > 15% but daily loss % stays below 10%... impossible with single bot.
      // Instead: three orders summing to -16000 drawdown but with profit between to reset consecutive losses
      // Actually: dailyPnl accumulates. So we need dailyPnlPct < 10% but drawdownPct > 15%.
      // With peak=100k: dailyPnl=-14000 (14% > 10%) triggers daily loss. So impossible with 100k peak.
      // Use peak=200k: dailyPnl=-16000 → dailyPnlPct=8% (<10%), drawdownPct=8% (<15%) — no halt.
      // Two rounds: first order pnl=-8000, second pnl=-8000 → daily=-16000, peak stays 200k.
      // dailyPnlPct=8% (<10%), drawdownPct=(200k-184k)/200k=8% (<15%). Still not enough.
      // We need to separate peakCapital from dailyPnl. Update peak via registerBot first.
      ks.registerBot('b1', 100000); // peak=100k
      ks.registerBot('b2', 300000); // peak=300k
      // Now: peak=300k. Loss of -50000 → dailyPnlPct=16.7% (>10%). Still daily triggers first.
      // The only way: profit orders accumulate dailyPnl to reduce daily%, then a big loss.
      // Actually: daily loss check runs on EVERY order. So we need peak high enough that
      // dailyPnl/peak < 10% at every step, but drawdown > 15%.
      // With peak=1M: 5 orders of -100000 = dailyPnl=-500000 (50% > 10%). Still fails.
      //
      // CORRECT APPROACH: profit in between resets consecutiveLosses but NOT dailyPnl.
      // So: profit orders ADD to dailyPnl, making it less negative.
      // Two orders: profit +100000, then loss -115000 → daily=-15000, peak=1M
      // dailyPnlPct=1.5% (<10%), drawdownPct=1.5% (<15%). No.
      //
      // REAL INSIGHT: peakCapital is set by registerBot, not updated by orders.
      // So: register bot with low capital, then use updatePeakCapital or higher register.
      ks.unregisterBot('b2'); // clean up, peak stays at 300k
      // Now peak=300k. Register with capital that doesn't change peak:
      ks.registerBot('b3', 50000); // peak stays 300k
      // Big loss: -50000 → dailyPnlPct=50000/300000=16.7% > 10%. Still daily.
      //
      // SIMPLEST FIX: override config for this test to set maxDailyLossPct high.
      // Recreate with custom config:
      ks = new Killswitch(makeCallbacks(), { cooldownMinutes: 5, maxDailyLossPct: 50, maxDrawdownPct: 15 });
      ks.registerBot('b1', 100000);
      ks.onOrderFilled({ id: 'o1', pnl: -16000 });
      expect(ks.isHalted()).toBe(true);
      expect(ks.getHaltReason()).toContain('Max drawdown');
    });
  });

  describe('onOrderFilled — disabled', () => {
    it('does nothing when disabled', () => {
      ks.disable();
      ks.registerBot('b1', 10000);
      ks.onOrderFilled({ id: 'o1', pnl: -100 });
      expect(callbacks.onOrderFilled).not.toHaveBeenCalled();
    });
  });

  describe('updatePeakCapital', () => {
    it('updates peak capital and computes drawdown when capital drops', () => {
      ks.registerBot('b1', 10000);
      ks.updatePeakCapital(12000);
      expect(ks.getState().peakCapital).toBe(12000);
      // Now update with lower capital to trigger drawdown
      ks.updatePeakCapital(9000);
      const state = ks.getState();
      expect(state.peakCapital).toBe(12000);
      expect(state.currentDrawdown).toBe(25); // (12000-9000)/12000*100 = 25%
    });
  });

  describe('registerBot / unregisterBot', () => {
    it('registers bot with initial state', () => {
      ks.registerBot('b1', 5000);
      const state = ks.getState();
      expect(state.peakCapital).toBe(5000);
    });

    it('updates peak capital if bot has higher capital', () => {
      ks.registerBot('b1', 5000);
      ks.registerBot('b2', 10000);
      expect(ks.getState().peakCapital).toBe(10000);
    });

    it('unregisterBot removes bot', () => {
      ks.registerBot('b1', 5000);
      ks.unregisterBot('b1');
      // After daily reset, b1 won't be there
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      ks.registerBot('b1', 10000);
      ks.manualHalt('test');
      ks.reset();
      expect(ks.isHalted()).toBe(false);
      expect(ks.isTradingEnabled()).toBe(true);
      expect(ks.getState().peakCapital).toBe(0);
    });
  });

  describe('recordError', () => {
    it('calls onError callback', () => {
      const err = new Error('test');
      ks.recordError(err, 'context');
      expect(callbacks.onError).toHaveBeenCalledWith(err, 'context');
    });
  });

  describe('halt — idempotent', () => {
    it('does not re-halt if already halted', () => {
      ks.manualHalt('first');
      ks.manualHalt('second'); // should be ignored
      expect(ks.getHaltReason()).toBe('Manual halt: first');
      expect(callbacks.onHalt).toHaveBeenCalledTimes(1);
    });
  });

  describe('isTradingEnabled — cooldown resume', () => {
    it('automatically resumes after cooldown expires', () => {
      ks.registerBot('b1', 10000);
      // Trigger halt via consecutive losses
      for (let i = 0; i < 5; i++) {
        ks.onOrderFilled({ id: `o${i}`, pnl: -10 });
      }
      expect(ks.isTradingEnabled()).toBe(false);
      // Advance past cooldown (5 minutes)
      vi.setSystemTime(new Date('2026-08-14T12:06:00Z'));
      expect(ks.isTradingEnabled()).toBe(true);
      expect(callbacks.onResume).toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('returns a copy of state', () => {
      const state1 = ks.getState();
      const state2 = ks.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // different object
    });
  });
});
