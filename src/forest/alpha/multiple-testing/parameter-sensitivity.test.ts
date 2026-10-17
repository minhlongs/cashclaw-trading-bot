// Multiple-Testing Defense — Parameter Sensitivity Tests

import { describe, expect, it } from 'vitest';
import { parameterSensitivity } from './overfitting-proxy';
import type { GridResult } from './overfitting-types';

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
      expect(result.maxDelta).toBeCloseTo(0.01, 6);
      expect(result.normalizedSpread).toBeCloseTo(0.5, 6);
      expect(result.sensitive).toBe(false);
    });
  });

  describe('sharp neighbor spike → sensitive', () => {
    it('one sharp spike among neighbors → sensitive:true', () => {
      const grid: GridResult[] = [
        { params: [1], metric: 1.0 },
        { params: [2], metric: 5.0 },
        { params: [3], metric: 1.0 },
      ];
      const result = parameterSensitivity(grid);
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
      expect(result.maxDelta).toBe(0.5);
    });

    it('non-neighbors do not contribute to maxDelta', () => {
      const grid: GridResult[] = [
        { params: [0], metric: 1.0 },
        { params: [2], metric: 10.0 },
      ];
      const result = parameterSensitivity(grid);
      expect(result.maxDelta).toBe(0);
      expect(result.normalizedSpread).toBe(0);
      expect(result.sensitive).toBe(false);
    });

    it('multi-dimensional params use Chebyshev distance', () => {
      const grid: GridResult[] = [
        { params: [0, 0], metric: 1.0 },
        { params: [1, 0], metric: 3.0 },
        { params: [0, 5], metric: 9.0 },
      ];
      const result = parameterSensitivity(grid);
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
        { params: [2], metric: 2.0 },
      ];
      expect(parameterSensitivity(grid, { maxNormalizedSpread: 0.9 }).sensitive).toBe(true);
      expect(parameterSensitivity(grid, { maxNormalizedSpread: 1 }).sensitive).toBe(false);
    });

    it('zero range yields zero normalizedSpread regardless of maxDelta', () => {
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
