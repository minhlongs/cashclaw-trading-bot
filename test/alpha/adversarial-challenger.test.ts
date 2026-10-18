import { describe, it, expect } from 'vitest';
import {
  checkParameterRobustness, checkCrossPeriodRobustness,
  checkCrossAssetRobustness, checkLeakageInvariance,
} from '../../src/forest/alpha/gate/robustness-checks';

describe('Adversarial Challenge: Checks 9-12 Empirical Stress Suite', () => {
  describe('Check 9: parameterRobustness', () => {
    it('passes at exact threshold 0.500', () => {
      const res = checkParameterRobustness(0.500, 0.50);
      expect(res.passed).toBe(true);
      expect(res.actual).toBe(0.500);
    });
    it('fails at 0.501 (boundary fail)', () => {
      const res = checkParameterRobustness(0.501, 0.50);
      expect(res.passed).toBe(false);
      expect(res.actual).toBe(0.501);
    });
    it('passes at 0.499 (boundary pass)', () => {
      const res = checkParameterRobustness(0.499, 0.50);
      expect(res.passed).toBe(true);
    });
    it('passes at 0.0 (flat response across parameter grid)', () => {
      const res = checkParameterRobustness(0.0, 0.50);
      expect(res.passed).toBe(true);
      expect(res.actual).toBe(0.0);
    });
    it('fails at parameter cliff (0.85, 1.0)', () => {
      expect(checkParameterRobustness(0.85, 0.50).passed).toBe(false);
      expect(checkParameterRobustness(1.0, 0.50).passed).toBe(false);
    });
    it('fails closed on negative spread, NaN, and infinities', () => {
      expect(checkParameterRobustness(-0.001, 0.50).passed).toBe(false);
      const resNan = checkParameterRobustness(Number.NaN, 0.50);
      expect(resNan.passed).toBe(false);
      expect(resNan.actual).toBeNull();
      expect(checkParameterRobustness(Infinity, 0.50).passed).toBe(false);
      expect(checkParameterRobustness(-Infinity, 0.50).passed).toBe(false);
    });
    it('honors custom threshold', () => {
      expect(checkParameterRobustness(0.30, 0.30).passed).toBe(true);
      expect(checkParameterRobustness(0.31, 0.30).passed).toBe(false);
    });
  });

  describe('Check 10: crossPeriodRobustness', () => {
    it('passes at exact threshold 60.0% (0.600)', () => {
      const res = checkCrossPeriodRobustness(0.600, 0.60);
      expect(res.passed).toBe(true);
      expect(res.actual).toBe(0.600);
    });
    it('fails at 59.9% (0.599 boundary fail)', () => {
      const res = checkCrossPeriodRobustness(0.599, 0.60);
      expect(res.passed).toBe(false);
      expect(res.actual).toBe(0.599);
    });
    it('passes at 60.1% (0.601 boundary pass)', () => {
      expect(checkCrossPeriodRobustness(0.601, 0.60).passed).toBe(true);
    });
    it('evaluates window fractions correctly (3/5 passes, 2/5 fails)', () => {
      expect(checkCrossPeriodRobustness(3 / 5, 0.60).passed).toBe(true);
      expect(checkCrossPeriodRobustness(2 / 5, 0.60).passed).toBe(false);
    });
    it('fails closed on 0 windows (NaN), 0% positive, > 1.0, negative, and infinities', () => {
      const resNan = checkCrossPeriodRobustness(Number.NaN, 0.60);
      expect(resNan.passed).toBe(false);
      expect(resNan.actual).toBeNull();
      expect(checkCrossPeriodRobustness(0.0, 0.60).passed).toBe(false);
      expect(checkCrossPeriodRobustness(1.001, 0.60).passed).toBe(false);
      expect(checkCrossPeriodRobustness(-0.1, 0.60).passed).toBe(false);
      expect(checkCrossPeriodRobustness(Infinity, 0.60).passed).toBe(false);
    });
  });

  describe('Check 11: crossAssetRobustness', () => {
    it('passes at exact threshold 50.0% (0.500)', () => {
      const res = checkCrossAssetRobustness(0.500, true, 0.50);
      expect(res.passed).toBe(true);
      expect(res.actual).toBe(0.500);
    });
    it('fails at 49.9% (0.499 boundary fail)', () => {
      const res = checkCrossAssetRobustness(0.499, true, 0.50);
      expect(res.passed).toBe(false);
      expect(res.actual).toBe(0.499);
    });
    it('passes at 50.1% (0.501 boundary pass)', () => {
      expect(checkCrossAssetRobustness(0.501, true, 0.50).passed).toBe(true);
    });
    it('supports applicable=false exemption regardless of input fraction', () => {
      const resNull = checkCrossAssetRobustness(null, false, 0.50);
      expect(resNull.passed).toBe(true);
      expect(resNull.actual).toBeNull();
      expect(resNull.detail).toContain('Exempted: asset-specific');
      expect(checkCrossAssetRobustness(undefined, false, 0.50).passed).toBe(true);
      expect(checkCrossAssetRobustness(0.0, false, 0.50).passed).toBe(true);
      expect(checkCrossAssetRobustness(0.2, false, 0.50).passed).toBe(true);
    });
    it('fails closed when applicable=true with missing or invalid metrics', () => {
      expect(checkCrossAssetRobustness(null, true, 0.50).passed).toBe(false);
      expect(checkCrossAssetRobustness(undefined, true, 0.50).passed).toBe(false);
      expect(checkCrossAssetRobustness(Number.NaN, true, 0.50).passed).toBe(false);
      expect(checkCrossAssetRobustness(1.05, true, 0.50).passed).toBe(false);
      expect(checkCrossAssetRobustness(-0.1, true, 0.50).passed).toBe(false);
    });
  });

  describe('Check 12: leakageInvariance', () => {
    it('passes when exactly 0 mutations are observed', () => {
      const res = checkLeakageInvariance(0);
      expect(res.passed).toBe(true);
      expect(res.actual).toBe(0);
      expect(res.threshold).toBe(0);
    });
    it('fails when exactly 1 mutation is observed (strict zero-tolerance)', () => {
      const res = checkLeakageInvariance(1);
      expect(res.passed).toBe(false);
      expect(res.actual).toBe(1);
      expect(res.detail).toContain('Lookahead leakage detected: 1');
    });
    it('fails closed on multiple, negative, fractional, or non-finite mutations', () => {
      expect(checkLeakageInvariance(5).passed).toBe(false);
      expect(checkLeakageInvariance(-1).passed).toBe(false);
      const resFrac = checkLeakageInvariance(0.5);
      expect(resFrac.passed).toBe(false);
      expect(resFrac.actual).toBeNull();
      expect(checkLeakageInvariance(Number.NaN).passed).toBe(false);
      expect(checkLeakageInvariance(Infinity).passed).toBe(false);
    });
  });
});
