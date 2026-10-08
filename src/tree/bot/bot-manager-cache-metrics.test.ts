import { describe, it, expect, beforeEach } from 'vitest';
import { BotManagerCacheMetrics } from './bot-manager-cache-metrics';

describe('BotManagerCacheMetrics', () => {
  let metrics: BotManagerCacheMetrics;

  beforeEach(() => {
    metrics = new BotManagerCacheMetrics();
  });

  it('initializes with zero counters and zero hit rate', () => {
    const snap = metrics.getSnapshot();
    expect(snap.hits).toBe(0);
    expect(snap.misses).toBe(0);
    expect(snap.evictions).toBe(0);
    expect(snap.rejections).toBe(0);
    expect(snap.hitRate).toBe(0);
  });

  it('accurately calculates hit rate across hits and misses', () => {
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordMiss();

    const snap = metrics.getSnapshot();
    expect(snap.hits).toBe(2);
    expect(snap.misses).toBe(1);
    expect(snap.hitRate).toBe(0.6667);
  });

  it('records evictions and rejections', () => {
    metrics.recordEviction();
    metrics.recordRejection();
    metrics.recordRejection();

    const snap = metrics.getSnapshot();
    expect(snap.evictions).toBe(1);
    expect(snap.rejections).toBe(2);
  });

  it('resets all counters back to zero', () => {
    metrics.recordHit();
    metrics.recordMiss();
    metrics.reset();

    const snap = metrics.getSnapshot();
    expect(snap.hits).toBe(0);
    expect(snap.misses).toBe(0);
    expect(snap.hitRate).toBe(0);
  });
});
