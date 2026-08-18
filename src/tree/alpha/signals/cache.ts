// File-system cache for derivative signal data (funding rate, OI, liquidations).
// Reuses the same path-safety pattern as ohlcv-cache.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, '..', '..', '..', '..', '.cache', 'derivatives');

function ensureDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return resolve(CACHE_DIR, `${safe}.json`);
}

export interface DerivativeCacheEntry {
  symbol: string;
  funding: { timestamp: number; fundingRate: number; markPrice: number }[];
  oi: { timestamp: number; openInterest: number; notionalUsd: number }[];
  liquidations: { timestamp: number; side: string; price: number; quantity: number; notionalUsd: number }[];
  cachedAt: number;
}

export function loadDerivativeCache(key: string): DerivativeCacheEntry | null {
  try {
    const p = cachePath(key);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf-8')) as DerivativeCacheEntry;
  } catch {
    return null;
  }
}

export function saveDerivativeCache(key: string, entry: DerivativeCacheEntry): void {
  try {
    ensureDir();
    writeFileSync(cachePath(key), JSON.stringify(entry), 'utf-8');
  } catch { /* best-effort */ }
}

export function clearDerivativeCache(key: string): void {
  try {
    const p = cachePath(key);
    if (existsSync(p)) unlinkSync(p);
  } catch { /* best-effort */ }
}

export function derivativeCacheKey(symbol: string): string {
  return `binance:${symbol.replace('/', '-')}:derivatives`;
}