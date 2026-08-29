import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, renameSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTUAL_CACHE_DIR = resolve(__dirname, '..', '..', '..', '..', '.cache', 'derivatives');
const BACKUP_DIR = `${ACTUAL_CACHE_DIR}.test-backup`;

type CacheModule = typeof import('./cache');
let cache: CacheModule;

// DISABLED is computed at import time from env vars, so each scenario needs a
// fresh module instance evaluated with the desired env.
async function importCache(env: { NODE_ENV?: string; VITEST?: string }): Promise<void> {
  vi.resetModules();
  process.env.NODE_ENV = env.NODE_ENV ?? 'development';
  process.env.VITEST = env.VITEST ?? '0';
  cache = (await import('./cache')) as CacheModule;
}

// Preserve real dev cache data: move the dir aside, run tests in a clean dir,
// restore afterwards.
function backupCacheDir(): void {
  if (existsSync(ACTUAL_CACHE_DIR)) {
    if (existsSync(BACKUP_DIR)) rmSync(BACKUP_DIR, { recursive: true, force: true });
    renameSync(ACTUAL_CACHE_DIR, BACKUP_DIR);
  }
}

function restoreCacheDir(): void {
  if (existsSync(ACTUAL_CACHE_DIR)) rmSync(ACTUAL_CACHE_DIR, { recursive: true, force: true });
  if (existsSync(BACKUP_DIR)) renameSync(BACKUP_DIR, ACTUAL_CACHE_DIR);
}

describe('cache.ts — derivative cache', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalVitest = process.env.VITEST;

  beforeEach(() => {
    backupCacheDir();
  });

  afterEach(() => {
    restoreCacheDir();
    process.env.NODE_ENV = originalEnv;
    process.env.VITEST = originalVitest;
    vi.resetModules();
  });

  describe('derivativeCacheKey', () => {
    it('generates consistent key for symbol', async () => {
      await importCache({});
      expect(cache.derivativeCacheKey('BTCUSDT')).toBe('binance:BTCUSDT:derivatives');
      expect(cache.derivativeCacheKey('BTC/USDT')).toBe('binance:BTC-USDT:derivatives');
      expect(cache.derivativeCacheKey('ETH/USDT')).toBe('binance:ETH-USDT:derivatives');
    });
  });

  describe('loadDerivativeCache', () => {
    it('returns null when cache is disabled (test env)', async () => {
      await importCache({ NODE_ENV: 'test', VITEST: '1' });
      mkdirSync(ACTUAL_CACHE_DIR, { recursive: true });
      writeFileSync(resolve(ACTUAL_CACHE_DIR, 'disabled-key.json'), JSON.stringify({ cachedAt: 1 }));
      expect(cache.loadDerivativeCache('disabled-key')).toBeNull();
    });

    it('returns null when VITEST=1 alone disables the cache', async () => {
      await importCache({ NODE_ENV: 'development', VITEST: '1' });
      expect(cache.loadDerivativeCache('any-key')).toBeNull();
    });

    it('returns null when file does not exist', async () => {
      await importCache({});
      expect(cache.loadDerivativeCache('nonexistent-key')).toBeNull();
    });

    it('returns parsed entry when file exists', async () => {
      await importCache({});
      const entry = {
        symbol: 'BTCUSDT',
        funding: [{ timestamp: 1000, fundingRate: 0.0001, markPrice: 50000 }],
        oi: [{ timestamp: 1000, openInterest: 1000, notionalUsd: 50000000 }],
        liquidations: [{ timestamp: 1000, side: 'long', price: 50000, quantity: 1, notionalUsd: 50000 }],
        cachedAt: 1000,
      };
      cache.saveDerivativeCache('test-key', entry);
      expect(cache.loadDerivativeCache('test-key')).toEqual(entry);
    });

    it('returns null on JSON parse error', async () => {
      await importCache({});
      mkdirSync(ACTUAL_CACHE_DIR, { recursive: true });
      writeFileSync(resolve(ACTUAL_CACHE_DIR, 'invalid-key.json'), 'not-json');
      expect(cache.loadDerivativeCache('invalid-key')).toBeNull();
    });
  });

  describe('saveDerivativeCache', () => {
    it('does nothing when cache is disabled (test env)', async () => {
      await importCache({ NODE_ENV: 'test', VITEST: '1' });
      const entry = { symbol: 'BTCUSDT', funding: [], oi: [], liquidations: [], cachedAt: 1000 };
      expect(() => cache.saveDerivativeCache('test-key', entry)).not.toThrow();
      expect(existsSync(ACTUAL_CACHE_DIR)).toBe(false);
    });

    it('creates cache directory if missing', async () => {
      await importCache({});
      const entry = { symbol: 'BTCUSDT', funding: [], oi: [], liquidations: [], cachedAt: 1000 };
      cache.saveDerivativeCache('new-key', entry);
      expect(existsSync(ACTUAL_CACHE_DIR)).toBe(true);
    });

    it('writes entry to file', async () => {
      await importCache({});
      const entry = {
        symbol: 'BTCUSDT',
        funding: [{ timestamp: 1000, fundingRate: 0.0001, markPrice: 50000 }],
        oi: [{ timestamp: 1000, openInterest: 1000, notionalUsd: 50000000 }],
        liquidations: [{ timestamp: 1000, side: 'long', price: 50000, quantity: 1, notionalUsd: 50000 }],
        cachedAt: 1000,
      };
      cache.saveDerivativeCache('write-key', entry);
      expect(cache.loadDerivativeCache('write-key')).toEqual(entry);
    });

    it('overwrites existing entry', async () => {
      await importCache({});
      const entry1 = { symbol: 'BTCUSDT', funding: [], oi: [], liquidations: [], cachedAt: 1000 };
      const entry2 = {
        symbol: 'BTCUSDT',
        funding: [{ timestamp: 2000, fundingRate: 0.0002, markPrice: 51000 }],
        oi: [],
        liquidations: [],
        cachedAt: 2000,
      };
      cache.saveDerivativeCache('overwrite-key', entry1);
      cache.saveDerivativeCache('overwrite-key', entry2);
      expect(cache.loadDerivativeCache('overwrite-key')).toEqual(entry2);
    });
  });

  describe('clearDerivativeCache', () => {
    it('does nothing when cache is disabled (test env)', async () => {
      await importCache({ NODE_ENV: 'test', VITEST: '1' });
      expect(() => cache.clearDerivativeCache('test-key')).not.toThrow();
    });

    it('removes existing cache file', async () => {
      await importCache({});
      const entry = { symbol: 'BTCUSDT', funding: [], oi: [], liquidations: [], cachedAt: 1000 };
      cache.saveDerivativeCache('clear-key', entry);
      expect(cache.loadDerivativeCache('clear-key')).not.toBeNull();
      cache.clearDerivativeCache('clear-key');
      expect(cache.loadDerivativeCache('clear-key')).toBeNull();
    });

    it('does not throw when file does not exist', async () => {
      await importCache({});
      expect(() => cache.clearDerivativeCache('nonexistent-key')).not.toThrow();
    });
  });

  describe('cachePath safety', () => {
    it('neutralizes path traversal attempts via safe()', async () => {
      await importCache({});
      const entry = { symbol: 'BTCUSDT', funding: [], oi: [], liquidations: [], cachedAt: 1000 };
      expect(() => cache.saveDerivativeCache('../../etc/passwd', entry)).not.toThrow();
      expect(() => cache.saveDerivativeCache('key/with/slashes', entry)).not.toThrow();
      const files = existsSync(ACTUAL_CACHE_DIR) ? readdirSync(ACTUAL_CACHE_DIR) : [];
      expect(files.length).toBeGreaterThan(0);
      expect(files.every(f => !f.includes('..') && !f.includes('/') && !f.includes('\\'))).toBe(true);
    });
  });
});
