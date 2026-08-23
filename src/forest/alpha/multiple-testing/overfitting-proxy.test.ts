// Multiple-Testing Defense — Overfitting Proxy Tests
// Covers: pboProxy deterministic (same input → same output); high-PBO matrix (lucky configs rank low OOS) → high pbo;
// parameterSensitivity: flat grid → not sensitive, sharp neighbor spike → sensitive; maxDelta correct

import { describe, expect, it } from 'vitest';
import { pboProxy, parameterSensitivity } from './overfitting-proxy';
import type { GridResult } from './overfitting-types';

describe('pboProxy', () => {
  describe('determinism', () => {
    it('same input → same output', () => {
      const matrix = [
        [1, 2],
        [2, 1],
      ];
      const r1 = pboProxy(matrix);
      const r2 = pboProxy(matrix);
      expect(r1.pbo).toBe(r2.pbo);
      expect(r1.configs).toBe(r2.configs);
      expect(r1.windows).toBe(r2.windows);
    });
  });

  describe('happy path', () => {
    it('returns configs and windows counts', () => {
      const matrix = [
        [1, 2, 3],
        [3, 2, 1],
        [2, 2, 2],
        [1, 1, 4],
      ];
      const result = pboProxy(matrix);
      expect(result.configs).toBe(4);
      expect(result.windows).toBe(3);
    });

    it('pbo is in [0, 1]', () => {
      const matrix = [
        [0.1, 0.5],
        [0.9, -0.3],
        [-0.7, 0.8],
        [0.2, 0.1],
      ];
      const result = pboProxy(matrix);
      expect(result.pbo).toBeGreaterThanOrEqual(0);
      expect(result.pbo).toBeLessThanOrEqual(1);
    });
  });

  describe('high-PBO matrix (lucky configs rank low OOS)', () => {
    it('IS-best half finishing below-median OOS yields high pbo', () => {
      // 4 configs, 2 windows. IS mean = mean across ALL windows.
      // Final window (col index 1) determines OOS performance.
      // Config A: IS mean (100-50)/2 = 25, OOS final -50
      // Config B: IS mean (90-40)/2 = 25,  OOS final -40
      // Config C: IS mean (10+30)/2 = 20,  OOS final 30
      // Config D: IS mean (5+20)/2 = 12.5, OOS final 20
      // IS ranking (ties broken by lowest index): A, B, C, D → top half A, B
      // Median of finals [-50, -40, 30, 20] = (-40 + 20)/2 = -10
      // A (-50) and B (-40) both < -10 → belowMedian = 2 → pbo = 2/2 = 1.0
      const matrix = [
        [100, -50], // A
        [90, -40],  // B
        [10, 30],   // C
        [5, 20],    // D
      ];
      const result = pboProxy(matrix);
      expect(result.pbo).toBe(1.0); // all IS-best configs finish below median OOS
    });

    it('IS-best half finishing above-median OOS yields low pbo', () => {
      // Configs where in-sample ranking survives out-of-sample.
      // Config A: IS mean 10, OOS final 100
      // Config B: IS mean 9,  OOS final 90
      // Config C: IS mean 1,  OOS final 10
      // Config D: IS mean 0,  OOS final 5
      // Median of finals [100, 90, 10, 5] = (90 + 10)/2 = 50
      // Top half: A (100), B (90). Both >= 50 → belowMedian = 0
      // pbo = 0/2 = 0
      const matrix = [
        [20, 100],
        [18, 90],
        [2, 10],
        [0, 5],
      ];
      const result = pboProxy(matrix);
      expect(result.pbo).toBe(0);
    });

    it('mixed performance yields intermediate pbo', () => {
      // IS mean = mean across ALL windows.
      // Config A: IS mean (100-50)/2 = 25, OOS final -50
      // Config B: IS mean (90+60)/2 = 75,  OOS final 60
      // Config C: IS mean (10+30)/2 = 20,  OOS final 30
      // Config D: IS mean (5+20)/2 = 12.5, OOS final 20
      // IS ranking: B (75), A (25), C (20), D (12.5) → top half B, A
      // Median of finals [-50, 60, 30, 20] = (20 + 30)/2 = 25
      // A (-50) < 25 → below; B (60) >= 25 → above → pbo = 1/2 = 0.5
      const matrix = [
        [100, -50], // A
        [90, 60],   // B
        [10, 30],   // C
        [5, 20],    // D
      ];
      const result = pboProxy(matrix);
      expect(result.pbo).toBe(0.5);
    });
  });

  describe('fail-closed: invalid inputs throw', () => {
    it('fewer than 2 configurations throws', () => {
      expect(() => pboProxy([[1, 2]])).toThrow(
        'pboProxy requires at least 2 configurations, got 1',
      );
    });

    it('fewer than 2 windows throws', () => {
      expect(() => pboProxy([[1], [2]])).toThrow(
        'pboProxy requires at least 2 OOS windows, got 1',
      );
    });

    it('non-rectangular matrix throws', () => {
      expect(() =>
        pboProxy([
          [1, 2, 3],
          [1, 2],
        ]),
      ).toThrow('pboProxy requires a rectangular config x window matrix');
    });

    it('non-finite value throws', () => {
      expect(() =>
        pboProxy([
          [1, NaN],
          [2, 3],
        ]),
      ).toThrow('pboProxy matrix contains a non-finite value');
      expect(() =>
        pboProxy([
          [1, Infinity],
          [2, 3],
        ]),
      ).toThrow('pboProxy matrix contains a non-finite value');
    });
  });
});

describe('parameterSensitivity', () => {
  describe('flat grid → not sensitive', () => {
    it('identical metrics across neighbors → sensitive:false', () => {
      const grid: GridResult[] = [
        { params: [1], metric: 1.0 },
        { params: [2], metric: 1.0 },
        { params: [3], metric: 1.0 },
      ];
      const result = parameterSensitivity(grid);
      expect(result.maxDelta).toBe(0);
      expect(result.normalizedSpread).toBe(0);
      expect(result.sensitive).toBe(false);
    });

    it('small smooth variation → not sensitive', () => {
      const grid: GridResult[] = [
        { params: [1], metric: 1.00 },
        { params: [2], metric: 1.01 },
        { params: [3], metric: 1.02 },
      ];
      const result = parameterSensitivity(grid);
      // maxDelta between neighbors = 0.01; range = 0.02; normalizedSpread = 0.5
      expect(result.maxDelta).toBeCloseTo(0.01, 6);
      expect(result.normalizedSpread).toBeCloseTo(0.5, 6);
      // normalizedSpread > ceiling (default 0.5)? No — 0.5 is NOT > 0.5
      expect(result.sensitive).toBe(false);
    });
  });

  describe('sharp neighbor spike → sensitive', () => {
    it('one sharp spike among neighbors → sensitive:true', () => {
      const grid: GridResult[] = [
        { params: [1], metric: 1.0 },
        { params: [2], metric: 5.0 }, // spike
        { params: [3], metric: 1.0 },
      ];
      const result = parameterSensitivity(grid);
      // maxDelta between neighbors = |5-1| = 4; range = 4; normalizedSpread = 4/4 = 1
      expect(result.maxDelta).toBe(4);
      expect(result.normalizedSpread).toBe(1);
      expect(result.sensitive).toBe(true);
    });
  });

  describe('maxDelta correctness', () => {
    it('maxDelta equals largest neighbor delta', () => {
      const grid: GridResult[] = [
        { params: [0], metric: 2.0 },
        { params: [1], metric: 2.5 },
        { params: [2], metric: 2.2 },
      ];
      const result = parameterSensitivity(grid);
      // deltas: |2.5-2|=0.5, |2.2-2.5|=0.3; max = 0.5
      expect(result.maxDelta).toBe(0.5);
    });

    it('non-neighbors do not contribute to maxDelta', () => {
      // params distance > 1 means not neighbors — with single coordinate,
      // params [0] and [2] are distance 2 apart (not neighbors)
      const grid: GridResult[] = [
        { params: [0], metric: 1.0 },
        { params: [2], metric: 10.0 }, // far away param, big metric gap
      ];
      const result = parameterSensitivity(grid);
      expect(result.maxDelta).toBe(0);
      expect(result.normalizedSpread).toBe(0);
      expect(result.sensitive).toBe(false);
    });

    it('multi-dimensional params use Chebyshev distance', () => {
      const grid: GridResult[] = [
        { params: [0, 0], metric: 1.0 },
        { params: [1, 0], metric: 3.0 }, // distance 1 → neighbor
        { params: [0, 5], metric: 9.0 }, // distance 5 from first → not neighbor; distance 5 from second → not neighbor
      ];
      const result = parameterSensitivity(grid);
      // Only pair ([0,0],[1,0]) are neighbors → maxDelta = |3-1| = 2
      expect(result.maxDelta).toBe(2);
    });

    it('uniform param dimensions required', () => {
      const grid: GridResult[] = [
        { params: [0, 0], metric: 1.0 },
        { params: [1], metric: 3.0 },
      ];
      expect(() => parameterSensitivity(grid)).toThrow(
        'parameterSensitivity requires uniform param dimensions',
      );
    });
  });

  describe('determinism', () => {
    it('same input → same output', () => {
      const grid: GridResult[] = [
        { params: [1], metric: 1.0 },
        { params: [2], metric: 4.0 },
      ];
      const r1 = parameterSensitivity(grid);
      const r2 = parameterSensitivity(grid);
      expect(r1.maxDelta).toBe(r2.maxDelta);
      expect(r1.normalizedSpread).toBe(r2.normalizedSpread);
      expect(r1.sensitive).toBe(r2.sensitive);
    });
  });

  describe('fail-closed: invalid inputs throw', () => {
    it('fewer than 2 results throws', () => {
      expect(() => parameterSensitivity([{ params: [1], metric: 1.0 }])).toThrow(
        'parameterSensitivity requires at least 2 grid results, got 1',
      );
    });

    it('non-finite metric throws', () => {
      const grid: GridResult[] = [
        { params: [1], metric: NaN },
        { params: [2], metric: 1.0 },
      ];
      expect(() => parameterSensitivity(grid)).toThrow(
        'parameterSensitivity grid contains a non-finite metric',
      );
    });

    it('negative ceiling throws', () => {
      const grid: GridResult[] = [
        { params: [1], metric: 1.0 },
        { params: [2], metric: 1.0 },
      ];
      expect(() => parameterSensitivity(grid, { maxNormalizedSpread: -1 })).toThrow(
        'maxNormalizedSpread must be finite and >= 0, got -1',
      );
    });
  });

  describe('custom ceiling', () => {
    it('custom maxNormalizedSpread respected', () => {
      const grid: GridResult[] = [
        { params: [1], metric: 1.0 },
        { params: [2], metric: 2.0 }, // maxDelta=1, range=1, spread=1
      ];
      expect(parameterSensitivity(grid, { maxNormalizedSpread: 0.9 }).sensitive).toBe(true);
      expect(parameterSensitivity(grid, { maxNormalizedSpread: 1 }).sensitive).toBe(false);
    });

    it('zero range yields zero normalizedSpread regardless of maxDelta', () => {
      // All metrics equal → range 0 → normalizedSpread 0
      const grid: GridResult[] = [
        { params: [1], metric: 2.0 },
        { params: [2], metric: 2.0 },
      ];
      const result = parameterSensitivity(grid);
      expect(result.maxDelta).toBe(0);
      expect(result.normalizedSpread).toBe(0);
      expect(result.sensitive).toBe(false);
    });
  });
});