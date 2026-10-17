// Multiple-Testing Defense — PBO Proxy Tests

import { describe, expect, it } from 'vitest';
import { pboProxy } from './overfitting-proxy';

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
        [4, 5, 6],
        [7, 8, 9],
        [10, 11, 12],
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
      const matrix = [
        [100, -50], // A
        [90, -40],  // B
        [10, 30],   // C
        [5, 20],    // D
      ];
      const result = pboProxy(matrix);
      expect(result.pbo).toBe(1.0);
    });

    it('IS-best half finishing above-median OOS yields low pbo', () => {
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
