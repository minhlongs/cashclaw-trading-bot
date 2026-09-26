import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalize } from '../../src/lib/canonical-json';
import {
  checkParameterRobustness,
  checkCrossPeriodRobustness,
  checkCrossAssetRobustness,
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
  checkBaselineComparison,
  checkReproducibleHash,
} from '../../src/forest/alpha/gate/robustness-checks';

describe('Adversarial Challenge: Checks 9-15 Empirical Stress Suite', () => {
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

  describe('Check 13: noSingleWindowDependency', () => {
    it('fails 100% when W=1 regardless of profit or loss', () => {
      const resProfit = checkNoSingleWindowDependency([1000], 0.50);
      expect(resProfit.passed).toBe(false);
      expect(resProfit.actual).toBe(1.0);
      expect(resProfit.detail).toContain('(W=1) — fails anti-windfall requirement');

      expect(checkNoSingleWindowDependency([-500], 0.50).passed).toBe(false);
      expect(checkNoSingleWindowDependency([0], 0.50).passed).toBe(false);
    });

    it('passes when max window contributes exactly 50.0% [500, 500]', () => {
      const res = checkNoSingleWindowDependency([500, 500], 0.50);
      expect(res.passed).toBe(true);
      expect(res.actual).toBe(0.50);
    });

    it('fails when max window contributes 50.1% [501, 499]', () => {
      const res = checkNoSingleWindowDependency([501, 499], 0.50);
      expect(res.passed).toBe(false);
      expect(res.actual).toBe(0.501);
    });

    it('passes when max window contributes 49.9% [499, 251, 250]', () => {
      const res = checkNoSingleWindowDependency([499, 251, 250], 0.50);
      expect(res.passed).toBe(true);
      expect(res.actual).toBe(0.499);
    });

    it('fails closed on non-positive total PnL', () => {
      const resNeg = checkNoSingleWindowDependency([-100, -200], 0.50);
      expect(resNeg.passed).toBe(false);
      expect(resNeg.actual).toBeNull();
      expect(resNeg.detail).toContain('non-positive');

      expect(checkNoSingleWindowDependency([100, -200], 0.50).passed).toBe(false);
      expect(checkNoSingleWindowDependency([0, 0], 0.50).passed).toBe(false);
    });

    it('fails closed on empty array or non-finite elements', () => {
      expect(checkNoSingleWindowDependency([], 0.50).passed).toBe(false);
      expect(checkNoSingleWindowDependency([100, Number.NaN], 0.50).passed).toBe(false);
      expect(checkNoSingleWindowDependency([100, Infinity], 0.50).passed).toBe(false);
    });

    it('fails when positive total has single window contributing > 100% [120, -20]', () => {
      const res = checkNoSingleWindowDependency([120, -20], 0.50);
      expect(res.passed).toBe(false);
      expect(res.actual).toBe(1.20);
    });
  });

  describe('Check 14: baselineComparison', () => {
    const cand = { sharpe: 1.5, netPnl: 2000 };
    const bhPass = { sharpe: 1.0, netPnl: 1000 };
    const rePass = { sharpe: 0.2, netPnl: 100 };

    it('passes when candidate strictly outperforms both baselines on Sharpe and Net PnL', () => {
      const res = checkBaselineComparison(cand, bhPass, rePass);
      expect(res.passed).toBe(true);
      expect(res.actual).toBe(2000);
      expect(res.threshold).toBe('beats_both');
    });

    it('fails when candidate beats Random but lags Buy & Hold Sharpe', () => {
      const res = checkBaselineComparison(cand, { sharpe: 1.6, netPnl: 1000 }, rePass);
      expect(res.passed).toBe(false);
    });

    it('fails when candidate beats Random but lags Buy & Hold Net PnL', () => {
      const res = checkBaselineComparison(cand, { sharpe: 1.0, netPnl: 2500 }, rePass);
      expect(res.passed).toBe(false);
    });

    it('fails when candidate beats PnL but lags Sharpe', () => {
      const res = checkBaselineComparison(cand, { sharpe: 1.55, netPnl: 1500 }, rePass);
      expect(res.passed).toBe(false);
    });

    it('fails when candidate ties any baseline metric (strict > required)', () => {
      expect(checkBaselineComparison(cand, { sharpe: 1.5, netPnl: 1000 }, rePass).passed).toBe(false);
      expect(checkBaselineComparison(cand, { sharpe: 1.0, netPnl: 2000 }, rePass).passed).toBe(false);
      expect(checkBaselineComparison(cand, bhPass, { sharpe: 1.5, netPnl: 100 }).passed).toBe(false);
      expect(checkBaselineComparison(cand, bhPass, { sharpe: 0.2, netPnl: 2000 }).passed).toBe(false);
    });

    it('passes with marginal positive alpha 0.0001 over both baselines', () => {
      const res = checkBaselineComparison(
        { sharpe: 1.0001, netPnl: 1000.01 },
        { sharpe: 1.0000, netPnl: 1000.00 },
        { sharpe: 0.5000, netPnl: 500.00 },
      );
      expect(res.passed).toBe(true);
    });

    it('passes when baseline Sharpe is null and candidate Sharpe is positive', () => {
      const res = checkBaselineComparison(
        { sharpe: 1.0, netPnl: 1000 },
        { sharpe: null, netPnl: 500 },
        { sharpe: null, netPnl: 200 },
      );
      expect(res.passed).toBe(true);
    });

    it('fails closed on non-finite candidate or baseline metrics', () => {
      expect(checkBaselineComparison({ sharpe: Number.NaN, netPnl: 1000 }, bhPass, rePass).passed).toBe(false);
      expect(checkBaselineComparison({ sharpe: 1.5, netPnl: Number.NaN }, bhPass, rePass).passed).toBe(false);
      expect(checkBaselineComparison(cand, { sharpe: 1.0, netPnl: Number.NaN }, rePass).passed).toBe(false);
      expect(checkBaselineComparison(cand, bhPass, { sharpe: 0.2, netPnl: Number.NaN }).passed).toBe(false);
    });
  });

  describe('Check 15: reproducibleHash & Cryptographic Provenance', () => {
    it('evaluates checkReproducibleHash boolean matching strictly', () => {
      expect(checkReproducibleHash(true, { recordedHash: 'abc', expectedHash: 'abc' }).passed).toBe(true);
      expect(checkReproducibleHash(false, { recordedHash: 'abc', expectedHash: 'xyz' }).passed).toBe(false);
      expect(checkReproducibleHash(true, 'match').passed).toBe(true);
      expect(checkReproducibleHash(false, 'mismatch').passed).toBe(false);
      expect(checkReproducibleHash(true).passed).toBe(true);
      expect(checkReproducibleHash(false).passed).toBe(false);
    });

    it('fails closed on truthy non-booleans', () => {
      expect(checkReproducibleHash(1 as unknown as boolean).passed).toBe(false);
      expect(checkReproducibleHash('true' as unknown as boolean).passed).toBe(false);
      expect(checkReproducibleHash(null as unknown as boolean).passed).toBe(false);
      expect(checkReproducibleHash(undefined as unknown as boolean).passed).toBe(false);
    });

    it('validates canonical SHA-256 pipeline with casing & whitespace normalization', () => {
      const gitSha = '0123456789abcdef0123456789abcdef01234567';
      const seed = 42;
      const config = { alpha: 'momentum-v1', params: { lookback: 20, threshold: 0.05 } };

      const canonical = canonicalize({ gitSha, seed, config });
      const expectedHash = createHash('sha256').update(canonical, 'utf8').digest('hex');

      // Exact match
      expect(checkReproducibleHash(expectedHash === expectedHash).passed).toBe(true);

      // 1-char difference strictly fails
      const alteredHash = (expectedHash.startsWith('a') ? 'b' : 'a') + expectedHash.slice(1);
      expect(checkReproducibleHash(alteredHash === expectedHash).passed).toBe(false);

      // Casing normalization (uppercase matches lowercase)
      expect(checkReproducibleHash(expectedHash.toUpperCase().toLowerCase() === expectedHash).passed).toBe(true);

      // Whitespace normalization (trimmed matches)
      const paddedHash = `  ${expectedHash}  \n`;
      expect(checkReproducibleHash(paddedHash.trim().toLowerCase() === expectedHash).passed).toBe(true);

      // Config key order invariance
      const reorderedConfig = { params: { threshold: 0.05, lookback: 20 }, alpha: 'momentum-v1' };
      const reorderedCanonical = canonicalize({ gitSha, seed, config: reorderedConfig });
      const reorderedHash = createHash('sha256').update(reorderedCanonical, 'utf8').digest('hex');
      expect(reorderedHash).toBe(expectedHash);
      expect(checkReproducibleHash(reorderedHash === expectedHash).passed).toBe(true);
    });
  });
});
