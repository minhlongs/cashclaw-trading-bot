import { describe, expect, it } from 'vitest';
import {
  computeFeatureSnapshotHash,
  computeFeatureSnapshotHashSync,
  verifyFeatureSnapshotHash,
  verifyFeatureSnapshotHashSync,
} from '../index';

describe('snapshot-hasher', () => {
  const sampleFeatures = {
    rsi14: 62.4,
    macd: {
      histogram: 0.0012,
      signal: 0.0045,
      macd: 0.0057,
    },
    volatility: [0.012, 0.015, 0.018],
    regime: 'TREND_UP',
  };

  it('produces a valid 64-character lowercase hexadecimal hash', async () => {
    const syncHash = computeFeatureSnapshotHashSync(sampleFeatures);
    const asyncHash = await computeFeatureSnapshotHash(sampleFeatures);

    expect(syncHash).toMatch(/^[a-f0-9]{64}$/);
    expect(asyncHash).toMatch(/^[a-f0-9]{64}$/);
    expect(syncHash).toBe(asyncHash);
  });

  it('guarantees key permutation invariance at top and nested levels', () => {
    const objA = { z: 1, a: 2, m: { y: 10, x: 20 } };
    const objB = { a: 2, m: { x: 20, y: 10 }, z: 1 };

    const hashA = computeFeatureSnapshotHashSync(objA);
    const hashB = computeFeatureSnapshotHashSync(objB);

    expect(hashA).toBe(hashB);
  });

  it('ignores undefined values consistently with canonical JSON', () => {
    const withUndefined = { a: 1, b: undefined, c: 3 };
    const withoutUndefined = { a: 1, c: 3 };

    expect(computeFeatureSnapshotHashSync(withUndefined)).toBe(
      computeFeatureSnapshotHashSync(withoutUndefined),
    );
  });

  it('preserves array element ordering sensitivity', () => {
    const arr1 = { items: [1, 2, 3] };
    const arr2 = { items: [3, 2, 1] };

    expect(computeFeatureSnapshotHashSync(arr1)).not.toBe(
      computeFeatureSnapshotHashSync(arr2),
    );
  });

  it('handles empty and null structures reliably', async () => {
    const emptyObjHash = computeFeatureSnapshotHashSync({});
    const emptyArrHash = computeFeatureSnapshotHashSync([]);
    const nullHash = computeFeatureSnapshotHashSync(null);

    expect(emptyObjHash).toMatch(/^[a-f0-9]{64}$/);
    expect(emptyArrHash).toMatch(/^[a-f0-9]{64}$/);
    expect(nullHash).toMatch(/^[a-f0-9]{64}$/);
    expect(emptyObjHash).not.toBe(emptyArrHash);
    expect(emptyObjHash).not.toBe(nullHash);

    expect(await computeFeatureSnapshotHash({})).toBe(emptyObjHash);
    expect(await computeFeatureSnapshotHash([])).toBe(emptyArrHash);
    expect(await computeFeatureSnapshotHash(null)).toBe(nullHash);
  });

  it('avoids collisions on slight feature variations', () => {
    const base = { price: 100.0, volume: 5000 };
    const perturbedPrice = { price: 100.00001, volume: 5000 };
    const perturbedVolume = { price: 100.0, volume: 5001 };

    const hBase = computeFeatureSnapshotHashSync(base);
    const hPrice = computeFeatureSnapshotHashSync(perturbedPrice);
    const hVolume = computeFeatureSnapshotHashSync(perturbedVolume);

    expect(hBase).not.toBe(hPrice);
    expect(hBase).not.toBe(hVolume);
    expect(hPrice).not.toBe(hVolume);
  });

  it('verifies matching and mismatching hashes synchronously', () => {
    const hash = computeFeatureSnapshotHashSync(sampleFeatures);

    expect(verifyFeatureSnapshotHashSync(sampleFeatures, hash)).toBe(true);
    // Case-insensitive tolerance for verification inputs
    expect(verifyFeatureSnapshotHashSync(sampleFeatures, hash.toUpperCase())).toBe(true);
    // Modified features
    expect(verifyFeatureSnapshotHashSync({ ...sampleFeatures, rsi14: 63.0 }, hash)).toBe(false);
    // Malformed expected hashes
    expect(verifyFeatureSnapshotHashSync(sampleFeatures, 'invalid-hash')).toBe(false);
    expect(verifyFeatureSnapshotHashSync(sampleFeatures, 'a'.repeat(63))).toBe(false);
    expect(verifyFeatureSnapshotHashSync(sampleFeatures, 'z'.repeat(64))).toBe(false);
    expect(verifyFeatureSnapshotHashSync(sampleFeatures, '')).toBe(false);
  });

  it('verifies matching and mismatching hashes asynchronously', async () => {
    const hash = await computeFeatureSnapshotHash(sampleFeatures);

    await expect(verifyFeatureSnapshotHash(sampleFeatures, hash)).resolves.toBe(true);
    await expect(verifyFeatureSnapshotHash(sampleFeatures, hash.toUpperCase())).resolves.toBe(true);
    await expect(verifyFeatureSnapshotHash({ ...sampleFeatures, rsi14: 63.0 }, hash)).resolves.toBe(false);
    await expect(verifyFeatureSnapshotHash(sampleFeatures, 'not-a-hash')).resolves.toBe(false);
  });

  it('handles Date and BigInt serialization predictably', async () => {
    const date = new Date('2026-09-25T12:00:00.000Z');
    const payload = { timestamp: date, count: BigInt(42) };

    const syncHash = computeFeatureSnapshotHashSync(payload);
    const asyncHash = await computeFeatureSnapshotHash(payload);

    expect(syncHash).toMatch(/^[a-f0-9]{64}$/);
    expect(syncHash).toBe(asyncHash);
  });
});
