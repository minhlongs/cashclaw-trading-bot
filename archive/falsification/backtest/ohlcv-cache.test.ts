// Security tests for OHLCV cache — path traversal prevention

import { describe, it, expect } from 'vitest';
import { getCacheKey, cachePath, clearCache } from './ohlcv-cache';

describe('ohlcv-cache security', () => {
  it('sanitizes special characters in cache key', () => {
    const key = getCacheKey('binance', 'BTC/USDT', '1h');
    expect(key).not.toContain('/');
    expect(key).not.toContain(' ');
    expect(key).not.toContain('..');
  });

  it('handles path traversal attempts in symbol', () => {
    const key = getCacheKey('binance', '../../../etc/passwd', '1h');
    expect(key).not.toContain('/');
    // Dots are preserved by getCacheKey, but slashes are stripped — no traversal possible
    const path = cachePath(key);
    expect(path).toContain('.cache/ohlcv');
  });

  it('cachePath stays within cache directory', () => {
    const key = getCacheKey('binance', 'BTCUSDT', '1h');
    const path = cachePath(key);
    expect(path).toContain('.cache/ohlcv');
    expect(path).not.toContain('..');
  });

  it('rejects key with path separator injection', () => {
    // getCacheKey sanitizes inputs, replacing / with _
    const safeKey = getCacheKey('binance', '../../../etc/passwd', '1h');
    expect(safeKey).not.toContain('/');
    const path = cachePath(safeKey);
    expect(path).toContain('.cache/ohlcv');
  });
});