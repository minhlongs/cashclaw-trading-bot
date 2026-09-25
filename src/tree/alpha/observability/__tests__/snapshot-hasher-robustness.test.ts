import { describe, expect, it } from 'vitest';
import {
  computeFeatureSnapshotHash,
  computeFeatureSnapshotHashSync,
  verifyFeatureSnapshotHashSync,
} from '../index';

describe('snapshot-hasher robustness against extreme inputs', () => {
  it('handles deeply nested structures up to 50 levels deterministically', () => {
    let deepA: Record<string, unknown> = { val: 'leaf' };
    let deepB: Record<string, unknown> = { val: 'leaf' };

    for (let depth = 0; depth < 50; depth++) {
      deepA = { [`level_${depth}`]: deepA, sibling: depth };
      deepB = { sibling: depth, [`level_${depth}`]: deepB };
    }

    const hashA = computeFeatureSnapshotHashSync(deepA);
    const hashB = computeFeatureSnapshotHashSync(deepB);

    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    expect(hashA).toBe(hashB);
  });

  it('differentiates falsy and empty structures with unique hashes', () => {
    const emptyObj = computeFeatureSnapshotHashSync({});
    const emptyArr = computeFeatureSnapshotHashSync([]);
    const nullVal = computeFeatureSnapshotHashSync(null);
    const emptyStr = computeFeatureSnapshotHashSync('');
    const zeroVal = computeFeatureSnapshotHashSync(0);
    const falseVal = computeFeatureSnapshotHashSync(false);

    const hashes = [emptyObj, emptyArr, nullVal, emptyStr, zeroVal, falseVal];
    const uniqueHashes = new Set(hashes);

    expect(uniqueHashes.size).toBe(hashes.length);
    for (const h of hashes) {
      expect(h).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('discriminates between primitive types and string representations', () => {
    expect(computeFeatureSnapshotHashSync(true)).not.toBe(computeFeatureSnapshotHashSync('true'));
    expect(computeFeatureSnapshotHashSync(false)).not.toBe(computeFeatureSnapshotHashSync('false'));
    expect(computeFeatureSnapshotHashSync(1)).not.toBe(computeFeatureSnapshotHashSync('1'));
    expect(computeFeatureSnapshotHashSync(0)).not.toBe(computeFeatureSnapshotHashSync(false));
    expect(computeFeatureSnapshotHashSync(null)).not.toBe(computeFeatureSnapshotHashSync('null'));
  });

  it('handles special characters, unicode, and emojis in keys deterministically', () => {
    const objWithSpecialKeys1 = {
      'order:book/bids[0]': 123.45,
      'user name with spaces': 'trader_1',
      'tín_hiệu_alpha': 0.88,
      '🚀_target_gain': 0.05,
      'path\\to\\indicator': 1,
      '"quoted_key"': true,
      '01': 'leading_zero',
      '1': 'no_zero',
    };

    const objWithSpecialKeys2 = {
      '1': 'no_zero',
      '01': 'leading_zero',
      '"quoted_key"': true,
      'path\\to\\indicator': 1,
      '🚀_target_gain': 0.05,
      'tín_hiệu_alpha': 0.88,
      'user name with spaces': 'trader_1',
      'order:book/bids[0]': 123.45,
    };

    const hash1 = computeFeatureSnapshotHashSync(objWithSpecialKeys1);
    const hash2 = computeFeatureSnapshotHashSync(objWithSpecialKeys2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles Symbol properties and circular references safely', () => {
    const sym1 = Symbol('alphaFeature');
    const sym2 = Symbol('riskFeature');
    const symObj1 = { [sym1]: 42, [sym2]: 84, base: 1 };
    const symObj2 = { [sym2]: 84, [sym1]: 42, base: 1 };

    expect(computeFeatureSnapshotHashSync(symObj1)).toBe(
      computeFeatureSnapshotHashSync(symObj2),
    );

    const circularObj: Record<string, unknown> = { id: 'node_1' };
    circularObj.self = circularObj;

    const circularHash = computeFeatureSnapshotHashSync(circularObj);
    expect(circularHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('documents empirical behavior of undefined top-level inputs', async () => {
    // Top-level undefined is handled differently between WebCrypto TextEncoder and node:crypto
    expect(() => computeFeatureSnapshotHashSync(undefined)).toThrow(TypeError);

    const asyncHash = await computeFeatureSnapshotHash(undefined);
    expect(asyncHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyFeatureSnapshotHashSync(undefined, asyncHash)).toBe(false);
  });
});
