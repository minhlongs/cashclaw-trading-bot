import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Killswitch } from './killswitch';
import type { KillswitchCallbacks, KillswitchConfig } from './killswitch-types';
import type { OrderResult } from '../exchange/types';

function makeCallbacks(): KillswitchCallbacks {
  return { onHalt: vi.fn(), onResume: vi.fn(), onOrderPlaced: vi.fn(), onOrderFilled: vi.fn(), onError: vi.fn() };
}
function cfg(overrides: Partial<KillswitchConfig> = {}): KillswitchConfig {
  return { maxDailyLossPct: 10, maxConsecutiveLosses: 5, maxDrawdownPct: 20, cooldownMinutes: 30, ...overrides };
}
function filledOrder(pnl: number): OrderResult {
  return { id: 'o1', exchangeId: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'market', price: 50000, quantity: 0.1, filled: 0.1, status: 'filled', timestamp: Date.now(), pnl };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('constructor', () => {
  it('starts enabled, not halted, zeroed', () => {
    const s = new Killswitch(makeCallbacks(), cfg()).getState();
    expect(s.enabled).toBe(true); expect(s.halted).toBe(false); expect(s.haltReason).toBeNull();
    expect(s.dailyPnl).toBe(0); expect(s.consecutiveLosses).toBe(0); expect(s.peakCapital).toBe(0); expect(s.currentDrawdown).toBe(0);
  });
  it('applies partial config with defaults', () => {
    expect(new Killswitch(makeCallbacks(), { maxDailyLossPct: 5 }).isTradingEnabled()).toBe(true);
  });
});
describe('enable/disable', () => {
  it('disable stops trading, enable restores', () => {
    const ks = new Killswitch(makeCallbacks(), cfg());
    ks.disable(); expect(ks.isTradingEnabled()).toBe(false);
    ks.enable(); expect(ks.isTradingEnabled()).toBe(true);
  });
  it('enable clears halted state and cooldown', () => {
    const ks = new Killswitch(makeCallbacks(), cfg({ cooldownMinutes: 10 }));
    ks.manualHalt('x'); ks.enable();
    expect(ks.isHalted()).toBe(false); expect(ks.getState().cooldownUntil).toBeNull();
  });
});

describe('manualHalt / manualResume', () => {
  it('manualHalt prefixes reason, manualResume clears', () => {
    const cb = makeCallbacks();
    const ks = new Killswitch(cb, cfg());
    ks.manualHalt('maintenance');
    expect(ks.isHalted()).toBe(true); expect(ks.isManualHalt()).toBe(true);
    expect(ks.haltReason).toBe('Manual halt: maintenance');
    expect(cb.onHalt).toHaveBeenCalledWith('Manual halt: maintenance');
    ks.manualResume();
    expect(ks.isHalted()).toBe(false); expect(cb.onResume).toHaveBeenCalledOnce();
  });
  it('manualResume does nothing when not halted', () => {
    const cb = makeCallbacks();
    new Killswitch(cb, cfg()).manualResume();
    expect(cb.onResume).not.toHaveBeenCalled();
  });
  it('getHaltReason reflects state, isManualHalt false for auto-halt', () => {
    const ks = new Killswitch(makeCallbacks(), cfg());
    expect(ks.haltReason).toBeNull(); expect(ks.getHaltReason()).toBeNull();
    ks.manualHalt('test');
    expect(ks.haltReason).toBe('Manual halt: test'); expect(ks.getHaltReason()).toBe('Manual halt: test');
    const auto = new Killswitch(makeCallbacks(), cfg({ maxConsecutiveLosses: 1 }));
    auto.registerBot('b1', 1000); auto.updatePeakCapital(1000); auto.onOrderFilled(filledOrder(-10));
    expect(auto.isManualHalt()).toBe(false);
  });
});

describe('isTradingEnabled auto-resume', () => {
  it('resumes when cooldown expired', () => {
    const cb = makeCallbacks();
    const ks = new Killswitch(cb, cfg({ cooldownMinutes: 1 }));
    ks.manualHalt('test'); expect(ks.isHalted()).toBe(true);
    vi.advanceTimersByTime(2 * 60_000);
    expect(ks.isTradingEnabled()).toBe(true); expect(ks.isHalted()).toBe(false); expect(cb.onResume).toHaveBeenCalled();
  });
  it('returns false when cooldown not yet expired', () => {
    const ks = new Killswitch(makeCallbacks(), cfg({ cooldownMinutes: 10 }));
    ks.manualHalt('wait');
    vi.advanceTimersByTime(5 * 60_000);
    expect(ks.isTradingEnabled()).toBe(false);
  });
});
describe('halt idempotency + unregisterBot', () => {
  it('does not halt twice', () => {
    const cb = makeCallbacks();
    const ks = new Killswitch(cb, cfg({ maxConsecutiveLosses: 1 }));
    ks.registerBot('b1', 1000); ks.updatePeakCapital(1000);
    ks.onOrderFilled(filledOrder(-10)); expect(ks.isHalted()).toBe(true);
    ks.onOrderFilled(filledOrder(-20)); expect(cb.onHalt).toHaveBeenCalledTimes(1);
  });
  it('unregisterBot removes bot', () => {
    const ks = new Killswitch(makeCallbacks(), cfg());
    ks.registerBot('b1', 500); ks.unregisterBot('b1');
    expect(ks.getState().enabled).toBe(true);
  });
});
describe('daily loss limit', () => {
  it('halts when loss exceeds maxDailyLossPct', () => {
    const cb = makeCallbacks();
    const ks = new Killswitch(cb, cfg({ maxDailyLossPct: 10 }));
    ks.registerBot('b1', 1000); ks.updatePeakCapital(1000);
    ks.onOrderFilled(filledOrder(-110));
    expect(ks.isHalted()).toBe(true); expect(ks.haltReason).toContain('Daily loss limit');
  });
  it('does not halt within threshold or when peakCapital is zero', () => {
    const ks = new Killswitch(makeCallbacks(), cfg({ maxDailyLossPct: 10 }));
    ks.registerBot('b1', 1000); ks.updatePeakCapital(1000);
    ks.onOrderFilled(filledOrder(-50));
    expect(ks.isHalted()).toBe(false);
    expect(new Killswitch(makeCallbacks(), cfg({ maxDailyLossPct: 1 })).isHalted()).toBe(false);
  });
});

describe('consecutive losses', () => {
  it('halts at threshold, resets on profit and zero pnl, treats undefined as 0', () => {
    const ks = new Killswitch(makeCallbacks(), cfg({ maxConsecutiveLosses: 3 }));
    ks.registerBot('b1', 1000); ks.updatePeakCapital(1000);
    ks.onOrderFilled(filledOrder(-10)); ks.onOrderFilled(filledOrder(-20));
    expect(ks.isHalted()).toBe(false);
    ks.onOrderFilled(filledOrder(-5)); expect(ks.isHalted()).toBe(true);
    const ks2 = new Killswitch(makeCallbacks(), cfg({ maxConsecutiveLosses: 3 }));
    ks2.registerBot('b1', 1000); ks2.updatePeakCapital(1000);
    ks2.onOrderFilled(filledOrder(-10)); ks2.onOrderFilled(filledOrder(50));
    ks2.onOrderFilled(filledOrder(-5)); expect(ks2.isHalted()).toBe(false);
    const ks3 = new Killswitch(makeCallbacks(), cfg({ maxConsecutiveLosses: 2 }));
    ks3.registerBot('b1', 1000); ks3.updatePeakCapital(1000);
    ks3.onOrderFilled(filledOrder(-10)); ks3.onOrderFilled(filledOrder(0));
    expect(ks3.getState().consecutiveLosses).toBe(0);
    ks3.onOrderFilled({ id: 'o2' }); expect(ks3.getState().dailyPnl).toBe(-10);
  });
});
describe('drawdown', () => {
  it('halts when drawdown exceeds threshold', () => {
    const cb = makeCallbacks();
    const ks = new Killswitch(cb, cfg({ maxDrawdownPct: 10, maxDailyLossPct: 50 }));
    ks.registerBot('b1', 1000); ks.updatePeakCapital(1000);
    ks.onOrderFilled(filledOrder(-101));
    expect(ks.isHalted()).toBe(true); expect(ks.haltReason).toContain('Max drawdown');
  });
  it('does not halt below threshold', () => {
    const ks = new Killswitch(makeCallbacks(), cfg({ maxDrawdownPct: 50, maxDailyLossPct: 50 }));
    ks.registerBot('b1', 1000); ks.updatePeakCapital(1000);
    ks.onOrderFilled(filledOrder(-10));
    expect(ks.isHalted()).toBe(false);
  });
});
describe('onOrderFilled skip conditions', () => {
  it('skips when disabled or halted', () => {
    const cb = makeCallbacks();
    const ks = new Killswitch(cb, cfg()); ks.disable();
    ks.onOrderFilled(filledOrder(-500)); expect(cb.onOrderFilled).not.toHaveBeenCalled();
    const ks2 = new Killswitch(cb, cfg()); ks2.manualHalt('x');
    ks2.onOrderFilled(filledOrder(100)); expect(ks2.getState().dailyPnl).toBe(0);
  });
});
describe('updatePeakCapital', () => {
  it('tracks max peak and computes drawdown', () => {
    const ks = new Killswitch(makeCallbacks(), cfg());
    ks.updatePeakCapital(1000); expect(ks.getState().peakCapital).toBe(1000);
    ks.updatePeakCapital(1200); expect(ks.getState().peakCapital).toBe(1200);
    ks.updatePeakCapital(800); expect(ks.getState().peakCapital).toBe(1200);
    ks.updatePeakCapital(900);
    expect(ks.getState().currentDrawdown).toBeCloseTo(25, 0);
  });
});

describe('reset + recordError', () => {
  it('reset clears all state', () => {
    const ks = new Killswitch(makeCallbacks(), cfg({ cooldownMinutes: 5 }));
    ks.manualHalt('test'); ks.onOrderFilled(filledOrder(-50)); ks.registerBot('b1', 1000); ks.reset();
    const s = ks.getState();
    expect(s.halted).toBe(false); expect(s.haltReason).toBeNull(); expect(s.haltTimestamp).toBeNull();
    expect(s.cooldownUntil).toBeNull(); expect(s.dailyPnl).toBe(0); expect(s.consecutiveLosses).toBe(0);
    expect(s.peakCapital).toBe(0); expect(s.currentDrawdown).toBe(0); expect(s.enabled).toBe(true);
  });
  it('recordError delegates to onError', () => {
    const cb = makeCallbacks(); const err = new Error('timeout');
    new Killswitch(cb, cfg()).recordError(err, 'ws');
    expect(cb.onError).toHaveBeenCalledWith(err, 'ws');
  });
});

describe('daily reset timer', () => {
  it('resets state at midnight and reschedules', () => {
    const ks = new Killswitch(makeCallbacks(), cfg());
    ks.registerBot('b1', 1000); ks.updatePeakCapital(1000); ks.onOrderFilled(filledOrder(-100));
    expect(ks.getState().dailyPnl).toBe(-100);
    const now = Date.now();
    const tm = new Date(now); tm.setHours(0, 0, 0, 0); tm.setDate(tm.getDate() + 1);
    vi.advanceTimersByTime(tm.getTime() - now);
    expect(ks.getState().dailyPnl).toBe(0); expect(ks.getState().consecutiveLosses).toBe(0);
    expect(ks.getState().peakCapital).toBe(0); expect(ks.getState().currentDrawdown).toBe(0);
    ks.manualResume();
    ks.registerBot('b1', 1000); ks.updatePeakCapital(1000);
    ks.onOrderFilled(filledOrder(-30)); expect(ks.getState().dailyPnl).toBe(-30);
    const next = new Date(Date.now()); next.setHours(0, 0, 0, 0); next.setDate(next.getDate() + 1);
    vi.advanceTimersByTime(next.getTime() - Date.now());
    expect(ks.getState().dailyPnl).toBe(0);
  });
});
