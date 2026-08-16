import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WedgeWatchdog } from './wedge-watchdog';

describe('WedgeWatchdog', () => {
  let watchdog: WedgeWatchdog;

  beforeEach(() => {
    vi.useFakeTimers();
    watchdog = new WedgeWatchdog(1000, 500);
  });

  afterEach(() => {
    watchdog.stop();
    vi.useRealTimers();
  });

  it('fires onWedgeDetected when lastAcquire is stale beyond 2x refill cycle', () => {
    const onWedge = vi.fn();
    watchdog.start(onWedge);

    // No poke — simulate stuck queue
    // refillCycleMs=500 → threshold=1000ms. With strict >, need >1000ms elapsed.
    vi.advanceTimersByTime(1000); // 1000ms elapsed, not > 1000 → no hit
    expect(onWedge).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000); // 2000ms elapsed, >1000 → 1st stale hit
    expect(onWedge).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000); // 3000ms elapsed → 2nd stale hit → fires
    expect(onWedge).toHaveBeenCalledTimes(1);
  });

  it('poke() resets detection counter', () => {
    const onWedge = vi.fn();
    watchdog.start(onWedge);

    vi.advanceTimersByTime(1000); // 1000ms, not >1000 → no hit
    watchdog.poke(); // resets counter + lastAcquireAt
    vi.advanceTimersByTime(1000); // 1000ms from poke, not >1000 → 0 hits
    vi.advanceTimersByTime(1000); // 2000ms from poke, >1000 → 1 stale hit (not 2)
    expect(onWedge).not.toHaveBeenCalled();
  });

  it('stop() clears interval and no more fires', () => {
    const onWedge = vi.fn();
    watchdog.start(onWedge);
    watchdog.stop();

    vi.advanceTimersByTime(10000);
    expect(onWedge).not.toHaveBeenCalled();
  });

  it('double start() is idempotent', () => {
    const onWedge = vi.fn();
    watchdog.start(onWedge);
    watchdog.start(onWedge);

    // 3000ms total → >1000 twice → fires once
    vi.advanceTimersByTime(3000);
    expect(onWedge).toHaveBeenCalledTimes(1);
  });
});
