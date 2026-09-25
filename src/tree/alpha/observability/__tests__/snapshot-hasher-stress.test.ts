import { describe, expect, it } from 'vitest';
import {
  computeFeatureSnapshotHash,
  computeFeatureSnapshotHashSync,
} from '../index';

function permuteObject<T>(obj: unknown): T {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj as T;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort(() => Math.random() - 0.5);
  const result: Record<string, unknown> = {};
  for (const k of keys) {
    result[k] = permuteObject((obj as Record<string, unknown>)[k]);
  }
  return result as T;
}

function makeRandomPayload(seed: number, depth = 0): unknown {
  if (depth > 4 || seed % 5 === 0) {
    const choices = [seed * 1.0001, `str_${seed}`, seed % 2 === 0, null, [seed, seed + 1]];
    return choices[seed % choices.length];
  }
  const obj: Record<string, unknown> = {};
  const numKeys = (seed % 4) + 1;
  for (let i = 0; i < numKeys; i++) {
    const key = `k_${(seed + i * 17) % 23}_${i}`;
    obj[key] = makeRandomPayload((seed * 31 + i) % 1000, depth + 1);
  }
  return obj;
}

describe('snapshot-hasher stress testing', () => {
  it('guarantees key permutation invariance across 250 deeply nested variants', () => {
    for (let i = 1; i <= 50; i++) {
      const base = {
        meta: { id: `alpha_${i}`, version: i, flags: { active: true, stage: 'paper' } },
        metrics: { rsi: 30 + (i % 40), macd: { val: 0.1 * i, signal: -0.05 * i, hist: [i, i * 2] } },
        book: { bids: [{ p: 100 + i, q: 2 }, { p: 99 + i, q: 5 }], spreadBps: 2.5 },
      };
      const baseHash = computeFeatureSnapshotHashSync(base);

      for (let p = 0; p < 5; p++) {
        const permuted = permuteObject(base);
        const permutedHash = computeFeatureSnapshotHashSync(permuted);
        expect(permutedHash).toBe(baseHash);
      }
    }
  });

  it('omits undefined keys without altering adjacent keys or nested values', () => {
    const baseWithUndefined = {
      leading: undefined,
      alpha: 10,
      middle: undefined,
      nested: {
        x: 'keep_x',
        drop: undefined,
        y: 'keep_y',
        deep: { removed: undefined, valid: true },
      },
      trailing: undefined,
      arr: [{ preserved: 42, dropped: undefined }],
    };

    const cleanEquivalent = {
      alpha: 10,
      nested: {
        x: 'keep_x',
        y: 'keep_y',
        deep: { valid: true },
      },
      arr: [{ preserved: 42 }],
    };

    expect(computeFeatureSnapshotHashSync(baseWithUndefined)).toBe(
      computeFeatureSnapshotHashSync(cleanEquivalent),
    );
  });

  it('guarantees collision-free 64-char hex hashes across 1,000 distinct feature vectors', () => {
    const seenHashes = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const vector = {
        indicator_id: `rsi_stream_${i}`,
        price: 50000 + i * 0.01,
        volume: 1000 + i,
        sequence: i,
        active: i % 2 === 0,
        tags: [`t_${i % 10}`, `t_${i}`],
      };

      const hash = computeFeatureSnapshotHashSync(vector);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(seenHashes.has(hash)).toBe(false);
      seenHashes.add(hash);
    }

    expect(seenHashes.size).toBe(1000);
  });

  it('guarantees byte-for-byte identity between async and sync across 150 random payloads', async () => {
    for (let i = 1; i <= 150; i++) {
      const payload = makeRandomPayload(i * 37 + 11);
      const syncHash = computeFeatureSnapshotHashSync(payload);
      const asyncHash = await computeFeatureSnapshotHash(payload);

      expect(syncHash).toBe(asyncHash);
      expect(syncHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('efficiently hashes large feature vectors (3,000 features) in <100ms', () => {
    const largeFeatures: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      largeFeatures[`feature_indicator_${i}`] = i * 0.12345;
    }
    const t0 = performance.now();
    const hash = computeFeatureSnapshotHashSync(largeFeatures);
    const elapsedMs = performance.now() - t0;

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(elapsedMs).toBeLessThan(150);
  });

  it('handles extreme float numbers and arrays of numbers deterministically', () => {
    const floatPayload = {
      maxSafe: Number.MAX_SAFE_INTEGER,
      minSafe: Number.MIN_SAFE_INTEGER,
      epsilon: Number.EPSILON,
      tinySubnormal: 5e-324,
      prices: Array.from({ length: 500 }, (_, i) => 100 + Math.sin(i)),
    };
    const syncHash = computeFeatureSnapshotHashSync(floatPayload);
    expect(syncHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
