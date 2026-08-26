// Operator kernels — unit tests (Phase 3 Step 2).
// Vectors hand-computed to mirror zoo base.py semantics (decision D2):
// ddof=1 std, average-tie rank, window-start first-occurrence argmax/argmin,
// safe_div eps→null, decay_linear weights n..1, causal warmup nulls.

import { describe, expect, it } from 'vitest';
import {
  decayLinear,
  delta,
  signedPower,
  tsArgmax,
  tsArgmin,
  tsMax,
  tsMean,
  tsMin,
  tsRank,
  tsStd,
} from './operator-kernels';
import { safeDiv, tsCorr, tsCov } from './operator-kernels-pair';
import { rankCross, scaleCross, zscoreCross } from './operator-kernels-cross';

const approx = (a: number | null, b: number | null, eps = 1e-9): void => {
  if (a === null || b === null) {
    expect(a).toBe(b);
    return;
  }
  expect(Math.abs(a - b)).toBeLessThan(eps);
};

describe('single-series rolling kernels', () => {
  it('tsMean trailing window', () => {
    expect(tsMean([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it('tsStd uses ddof=1', () => {
    // window [1,2,3]: mean 2, ss 2, var 2/(3-1)=1 → std 1
    expect(tsStd([1, 2, 3, 4], 3)).toEqual([null, null, 1, 1]);
  });
  it('tsMax / tsMin trailing window', () => {
    expect(tsMax([3, 1, 4, 1, 5], 3)).toEqual([null, null, 4, 4, 5]);
    expect(tsMin([3, 1, 4, 1, 5], 3)).toEqual([null, null, 1, 1, 1]);
  });
  it('tsRank percentile with average ties', () => {
    // [1,3,3] last=3: less=1, eq=2 → (1 + 0.5*(2+1))/3 = 2.5/3
    const r = tsRank([1, 3, 3], 3);
    approx(r[2], 2.5 / 3);
    // strictly increasing → 1.0 at window end
    expect(tsRank([1, 2, 3], 3)[2]).toBe(1);
  });
  it('tsArgmax window-start convention, first occurrence on ties', () => {
    // [1,5,5] max=5 first at offset 1; [5,5,2] max=5 first at offset 0
    expect(tsArgmax([1, 5, 5, 2], 3)).toEqual([null, null, 1, 0]);
  });
  it('tsArgmin window-start convention, first occurrence on ties', () => {
    expect(tsArgmin([3, 1, 1, 4], 3)).toEqual([null, null, 1, 0]);
  });
  it('delta is x[t] - x[t-d] with d warmup nulls', () => {
    expect(delta([10, 11, 13, 16], 2)).toEqual([null, null, 3, 5]);
  });
  it('decayLinear weights n..1 oldest..newest', () => {
    // base.py: weights=np.arange(n,0,-1)=[3,2,1] dotted with window oldest..newest
    // (1*3 + 2*2 + 3*1) / 6 = 10/6
    approx(decayLinear([1, 2, 3], 3)[2], 10 / 6);
  });
  it('signedPower preserves sign', () => {
    expect(signedPower([-2, 3], 2)).toEqual([-4, 9]);
    approx(signedPower([-2], 0.5)[0], -Math.SQRT2);
  });
  it('NaN input propagates as null, never fabricated', () => {
    expect(tsMean([1, null, 3], 2)).toEqual([null, null, null]);
    expect(tsMean([1, null, 3, 4], 2)).toEqual([null, null, null, 3.5]);
  });
});

describe('pair-series kernels', () => {
  it('tsCorr perfect positive / negative correlation', () => {
    approx(tsCorr([1, 2, 3, 4], [2, 4, 6, 8], 4)[3], 1);
    approx(tsCorr([1, 2, 3, 4], [8, 6, 4, 2], 4)[3], -1);
  });
  it('tsCorr constant window → null (not zero)', () => {
    expect(tsCorr([1, 2, 3, 4], [5, 5, 5, 5], 4)[3]).toBeNull();
  });
  it('tsCov sample covariance ddof=1', () => {
    // x=[1,2,3] y=[2,4,6]: mx=2 my=4, sum((x-mx)(y-my))=4, /2 = 2
    approx(tsCov([1, 2, 3], [2, 4, 6], 3)[2], 2);
  });
  it('safeDiv: normal, zero denominator → null, null denominator → null', () => {
    approx(safeDiv([10], [2])[0], 5, 1e-9);
    expect(safeDiv([10], [0])[0]).toBeNull();
    expect(safeDiv([10], [null])[0]).toBeNull();
  });
});

describe('cross-sectional kernels', () => {
  it('rankCross percentile with average ties', () => {
    const r = rankCross([[1, 10], [2, 20], [3, 30]]);
    approx(r[0][0], 1 / 3);
    approx(r[1][0], 2 / 3);
    approx(r[2][0], 1);
    const tied = rankCross([[1], [1], [2]]);
    approx(tied[0][0], 0.5);
    approx(tied[1][0], 0.5);
    approx(tied[2][0], 1);
  });
  it('zscoreCross ddof=1; constant column → null', () => {
    const z = zscoreCross([[1], [2], [3]]);
    approx(z[0][0], -1);
    approx(z[1][0], 0);
    approx(z[2][0], 1);
    expect(zscoreCross([[5], [5], [5]])[0][0]).toBeNull();
  });
  it('scaleCross L1 normalize to target a', () => {
    const s = scaleCross([[1], [2], [3]], 1);
    approx(s[0][0], 1 / 6);
    approx(s[2][0], 3 / 6);
    const s2 = scaleCross([[1], [2], [3]], 2);
    approx(s2[2][0], 1);
  });
  it('cross-sectional kernels skip null entries', () => {
    const r = rankCross([[1], [null], [3]]);
    approx(r[0][0], 0.5);
    expect(r[1][0]).toBeNull();
    approx(r[2][0], 1);
  });
});
