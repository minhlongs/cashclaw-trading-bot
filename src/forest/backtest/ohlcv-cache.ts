// OHLCV file-system cache — avoids repeated exchange rate-limit hits during development.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const CACHE_DIR = resolve(process.cwd(), '.cache', 'ohlcv');
const DISABLED = process.env.NODE_ENV === 'test' || process.env.VITEST === '1';

export function getCacheKey(exchange: string, symbol: string, interval: string): string {
  return `${exchange}:${symbol.replace('/', '-')}:${interval}`;
}

export function cachePath(key: string): string {
  return resolve(CACHE_DIR, `${key}.json`);
}

export function loadCandles(key: string): { candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>; source: 'cache' | 'exchange' } | null {
  if (DISABLED) return null;
  const p = cachePath(key);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8'));
    if (!Array.isArray(data) || data.length === 0) return null;
    const sample = data[0];
    if (typeof sample.timestamp !== 'number') return null;
    return { candles: data, source: 'cache' };
  } catch {
    return null;
  }
}

export function saveCandles(key: string, candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>): void {
  if (DISABLED) return;
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(key), JSON.stringify(candles), 'utf-8');
  } catch (err) {
    // Non-fatal — caller still has candles in memory
  }
}

export function clearCache(): void {
  if (DISABLED) return;
  try {
    if (existsSync(CACHE_DIR)) {
      const files = readdirSync(CACHE_DIR, { recursive: true }) as string[];
      for (const f of files) {
        try { unlinkSync(resolve(CACHE_DIR, f)); } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
}