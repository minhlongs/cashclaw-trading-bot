// Multiple-Testing Defense — Bootstrap CI Tests
// Covers: CI lower ≤ point ≤ upper always; constant series → CI collapses to point;
// values.length < 2 or iterations < 1 → throw; same seed → bit-identical output

import { describe, expect, it } from 'vitest';
import { bootstrapCi, ciExcludesZero } from './bootstrap';
import type { BootstrapOptions } from './types';

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

describe('bootstrapCi', () => {
  const baseOptions: BootstrapOptions = {
    iterations: 1000,
    confidence: 0.95,
    seed: 42,
  };

  describe('happy path', () => {
    it('returns valid CI with lower ≤ point ≤ upper', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ci = bootstrapCi(values, mean, baseOptions);
      expect(ci.lower).toBeLessThanOrEqual(ci.point);
      expect(ci.point).toBeLessThanOrEqual(ci.upper);
      expect(ci.iterations).toBe(baseOptions.iterations);
      expect(ci.point).toBe(mean(values));
    });

    it('CI excludes zero for positive-mean data', () => {
      const values = [5, 6, 7, 8, 9, 10];
      const ci = bootstrapCi(values, mean, baseOptions);
      expect(ciExcludesZero(ci)).toBe(true);
      expect(ci.lower).toBeGreaterThan(0);
    });

    it('CI excludes zero for negative-mean data', () => {
      const values = [-10, -9, -8, -7, -6, -5];
      const ci = bootstrapCi(values, mean, baseOptions);
      expect(ciExcludesZero(ci)).toBe(true);
      expect(ci.upper).toBeLessThan(0);
    });

    it('CI includes zero for zero-mean data', () => {
      const values = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
      const ci = bootstrapCi(values, mean, baseOptions);
      expect(ciExcludesZero(ci)).toBe(false);
      expect(ci.lower).toBeLessThanOrEqual(0);
      expect(ci.upper).toBeGreaterThanOrEqual(0);
    });
  });

  describe('determinism: same seed → bit-identical output', () => {
    it('identical results on same seed', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ci1 = bootstrapCi(values, mean, { ...baseOptions, seed: 123 });
      const ci2 = bootstrapCi(values, mean, { ...baseOptions, seed: 123 });
      expect(ci1.lower).toBe(ci2.lower);
      expect(ci1.point).toBe(ci2.point);
      expect(ci1.upper).toBe(ci2.upper);
    });

    it('different seeds produce different CIs (with high probability)', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ci1 = bootstrapCi(values, mean, { ...baseOptions, seed: 123 });
      const ci2 = bootstrapCi(values, mean, { ...baseOptions, seed: 456 });
      // Different seeds should produce different results (extremely unlikely to be identical)
      const identical = ci1.lower === ci2.lower && ci1.point === ci2.point && ci1.upper === ci2.upper;
      expect(identical).toBe(false);
    });
  });

  describe('constant series → CI collapses to point', () => {
    it('all same values yields point CI', () => {
      const values = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const ci = bootstrapCi(values, mean, baseOptions);
      expect(ci.lower).toBe(5);
      expect(ci.point).toBe(5);
      expect(ci.upper).toBe(5);
      expect(ciExcludesZero(ci)).toBe(true);
    });

    it('constant zero series yields zero CI', () => {
      const values = [0, 0, 0, 0, 0];
      const ci = bootstrapCi(values, mean, baseOptions);
      expect(ci.lower).toBe(0);
      expect(ci.point).toBe(0);
      expect(ci.upper).toBe(0);
      expect(ciExcludesZero(ci)).toBe(false);
    });
  });

  describe('fail-closed: invalid inputs throw', () => {
    it('values.length < 2 throws', () => {
      expect(() => bootstrapCi([1], mean, baseOptions)).toThrow(
        'bootstrapCi requires at least 2 values, got 1',
      );
      expect(() => bootstrapCi([], mean, baseOptions)).toThrow(
        'bootstrapCi requires at least 2 values, got 0',
      );
    });

    it('iterations < 1 throws', () => {
      expect(() => bootstrapCi([1, 2], mean, { ...baseOptions, iterations: 0 })).toThrow(
        'bootstrapCi requires iterations >= 1, got 0',
      );
      expect(() => bootstrapCi([1, 2], mean, { ...baseOptions, iterations: -1 })).toThrow(
        'bootstrapCi requires iterations >= 1, got -1',
      );
      expect(() => bootstrapCi([1, 2], mean, { ...baseOptions, iterations: 0.5 })).toThrow(
        'bootstrapCi requires iterations >= 1, got 0.5',
      );
    });

    it('confidence outside (0, 1) throws', () => {
      expect(() => bootstrapCi([1, 2], mean, { ...baseOptions, confidence: 0 })).toThrow(
        'bootstrapCi requires confidence in (0, 1), got 0',
      );
      expect(() => bootstrapCi([1, 2], mean, { ...baseOptions, confidence: 1 })).toThrow(
        'bootstrapCi requires confidence in (0, 1), got 1',
      );
      expect(() => bootstrapCi([1, 2], mean, { ...baseOptions, confidence: 1.5 })).toThrow(
        'bootstrapCi requires confidence in (0, 1), got 1.5',
      );
      expect(() => bootstrapCi([1, 2], mean, { ...baseOptions, confidence: -0.1 })).toThrow(
        'bootstrapCi requires confidence in (0, 1), got -0.1',
      );
    });

    it('non-finite seed throws', () => {
      expect(() => bootstrapCi([1, 2], mean, { ...baseOptions, seed: NaN })).toThrow(
        'bootstrapCi requires a finite numeric seed',
      );
      expect(() => bootstrapCi([1, 2], mean, { ...baseOptions, seed: Infinity })).toThrow(
        'bootstrapCi requires a finite numeric seed',
      );
    });

    it('non-finite statistic result throws', () => {
      const badStat = () => NaN;
      expect(() => bootstrapCi([1, 2], badStat, baseOptions)).toThrow(
        'bootstrapCi statistic returned a non-finite value',
      );
    });
  });

  describe('different confidence levels', () => {
    it('higher confidence produces wider CI', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ci90 = bootstrapCi(values, mean, { ...baseOptions, confidence: 0.90 });
      const ci95 = bootstrapCi(values, mean, { ...baseOptions, confidence: 0.95 });
      const ci99 = bootstrapCi(values, mean, { ...baseOptions, confidence: 0.99 });
      expect(ci90.lower).toBeGreaterThanOrEqual(ci95.lower);
      expect(ci90.upper).toBeLessThanOrEqual(ci95.upper);
      expect(ci95.lower).toBeGreaterThanOrEqual(ci99.lower);
      expect(ci95.upper).toBeLessThanOrEqual(ci99.upper);
    });
  });

  describe('different statistics', () => {
    it('works with median statistic', () => {
      const median = (values: readonly number[]): number => {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 1
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
      };
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ci = bootstrapCi(values, median, baseOptions);
      expect(ci.point).toBe(median(values));
      expect(ci.lower).toBeLessThanOrEqual(ci.point);
      expect(ci.point).toBeLessThanOrEqual(ci.upper);
    });

    it('works with sum statistic', () => {
      const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
      const values = [1, 2, 3, 4, 5];
      const ci = bootstrapCi(values, sum, baseOptions);
      expect(ci.point).toBe(sum(values));
      expect(ci.lower).toBeLessThanOrEqual(ci.point);
      expect(ci.point).toBeLessThanOrEqual(ci.upper);
    });
  });
});