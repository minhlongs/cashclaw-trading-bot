// File-system cache for derivative signal data (funding rate, OI, liquidations).
// Reuses the same path-safety pattern as ohlcv-cache.ts: a realpathSync guard
// rejects any key that resolves outside the cache directory, and caching is
// disabled under test so test runs never write to .cache/derivatives.

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, '..', '..', '..', '..', '.cache', 'derivatives');
const DISABLED = process.env.NODE_ENV === 'test' || process.env.VITEST === '1';

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');

function cachePath(key: string): string {
  const fullPath = resolve(CACHE_DIR, `${safe(key)}.json`);
  try {
    const realCacheDir = realpathSync(CACHE_DIR);
    const realFullPath = realpathSync(fullPath);
    if (!realFullPath.startsWith(realCacheDir + sep)) {
      throw new Error('Path traversal attempt detected');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Path traversal')) throw err;
    // realpathSync can fail if the path doesn't exist yet — that's fine for
    // new cache entries.
  }
  return fullPath;
}

export interface DerivativeCacheEntry {
  symbol: string;
  funding: { timestamp: number; fundingRate: number; markPrice: number }[];
  oi: { timestamp: number; openInterest: number; notionalUsd: number | null }[];
  liquidations: { timestamp: number; side: string; price: number; quantity: number; notionalUsd: number }[];
  cachedAt: number;
}

export function loadDerivativeCache(key: string): DerivativeCacheEntry | null {
  if (DISABLED) return null;
  try {
    const p = cachePath(key);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf-8')) as DerivativeCacheEntry;
  } catch {
    return null;
  }
}

export function saveDerivativeCache(key: string, entry: DerivativeCacheEntry): void {
  if (DISABLED) return;
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(key), JSON.stringify(entry), 'utf-8');
  } catch { /* best-effort */ }
}

export function clearDerivativeCache(key: string): void {
  if (DISABLED) return;
  try {
    const p = cachePath(key);
    if (existsSync(p)) unlinkSync(p);
  } catch { /* best-effort */ }
}

export function derivativeCacheKey(symbol: string): string {
  return `binance:${symbol.replace('/', '-')}:derivatives`;
}