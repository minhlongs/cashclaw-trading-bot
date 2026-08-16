// Indicator Cache — LRU eviction for repeated indicator lookups.
// Cache key shape: ${indicatorName}:${lookback}:${symbol}:${timeframe}

import type { IndicatorResult } from '@/tree/alpha/indicator-types';

const DEFAULT_MAX_SIZE = 10_000;

export interface CacheEntry {
  result: IndicatorResult;
  timestamp: number;
}

export class IndicatorCache {
  private readonly max: number;
  private readonly store: Map<string, CacheEntry>;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.max = maxSize;
    this.store = new Map();
  }

  get(
    indicator: string,
    lookback: number,
    symbol: string,
    timeframe: string,
  ): IndicatorResult['value'] | undefined {
    const key = this.makeKey(indicator, lookback, symbol, timeframe);
    const entry = this.store.get(key);
    if (!entry) return undefined;
    // LRU touch: delete and re-insert to move to end (most recently used).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.result.value;
  }

  set(
    indicator: string,
    lookback: number,
    symbol: string,
    timeframe: string,
    result: IndicatorResult,
  ): void {
    const key = this.makeKey(indicator, lookback, symbol, timeframe);
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { result, timestamp: Date.now() });
    this.evictIfNeeded();
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private makeKey(
    indicator: string,
    lookback: number,
    symbol: string,
    timeframe: string,
  ): string {
    return `${indicator}:${lookback}:${symbol}:${timeframe}`;
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.max) {
      // Map iterates in insertion order; first entry is least recently used.
      const lruKey = this.store.keys().next().value;
      if (lruKey !== undefined) {
        this.store.delete(lruKey);
      }
    }
  }
}