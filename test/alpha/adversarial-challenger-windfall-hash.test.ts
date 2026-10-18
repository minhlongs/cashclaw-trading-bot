import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalize } from '../../src/lib/canonical-json';
import { checkNoSingleWindowDependency, checkBaselineComparison, checkReproducibleHash } from '../../src/forest/alpha/gate/robustness-checks';

describe('Adversarial Challenge: Checks 13-15 Empirical Stress Suite', () => {
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
      expect(checkBaselineComparison(cand, { sharpe: 1.6, netPnl: 1000 }, rePass).passed).toBe(false);
    });
    it('fails when candidate beats Random but lags Buy & Hold Net PnL', () => {
      expect(checkBaselineComparison(cand, { sharpe: 1.0, netPnl: 2500 }, rePass).passed).toBe(false);
    });
    it('fails when candidate beats PnL but lags Sharpe', () => {
      expect(checkBaselineComparison(cand, { sharpe: 1.55, netPnl: 1500 }, rePass).passed).toBe(false);
    });
    it('fails when candidate ties any baseline metric (strict > required)', () => {
      expect(checkBaselineComparison(cand, { sharpe: 1.5, netPnl: 1000 }, rePass).passed).toBe(false);
      expect(checkBaselineComparison(cand, { sharpe: 1.0, netPnl: 2000 }, rePass).passed).toBe(false);
      expect(checkBaselineComparison(cand, bhPass, { sharpe: 1.5, netPnl: 100 }).passed).toBe(false);
      expect(checkBaselineComparison(cand, bhPass, { sharpe: 0.2, netPnl: 2000 }).passed).toBe(false);
    });
    it('passes with marginal positive alpha 0.0001 over both baselines', () => {
      expect(checkBaselineComparison({ sharpe: 1.0001, netPnl: 1000.01 }, { sharpe: 1.0, netPnl: 1000 }, { sharpe: 1.0, netPnl: 1000 }).passed).toBe(true);
    });
    it('passes when baseline Sharpe is null and candidate Sharpe is positive', () => {
      expect(checkBaselineComparison({ sharpe: 1.0, netPnl: 1000 }, { sharpe: null, netPnl: 500 }, { sharpe: null, netPnl: 200 }).passed).toBe(true);
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
      for (const v of [1, 'true', null, undefined]) expect(checkReproducibleHash(v as unknown as boolean).passed).toBe(false);
    });
    it('validates canonical SHA-256 pipeline with casing & whitespace normalization', () => {
      const gitSha = '0123456789abcdef0123456789abcdef01234567';
      const seed = 42;
      const config = { alpha: 'momentum-v1', params: { lookback: 20, threshold: 0.05 } };
      const expectedHash = createHash('sha256').update(canonicalize({ gitSha, seed, config }), 'utf8').digest('hex');

      expect(checkReproducibleHash(expectedHash === expectedHash).passed).toBe(true);
      const alteredHash = (expectedHash.startsWith('a') ? 'b' : 'a') + expectedHash.slice(1);
      expect(checkReproducibleHash(alteredHash === expectedHash).passed).toBe(false);
      expect(checkReproducibleHash(expectedHash.toUpperCase().toLowerCase() === expectedHash).passed).toBe(true);
      expect(checkReproducibleHash(`  ${expectedHash}  \n`.trim().toLowerCase() === expectedHash).passed).toBe(true);

      const reorderedConfig = { params: { threshold: 0.05, lookback: 20 }, alpha: 'momentum-v1' };
      const reorderedHash = createHash('sha256').update(canonicalize({ gitSha, seed, config: reorderedConfig }), 'utf8').digest('hex');
      expect(reorderedHash).toBe(expectedHash);
      expect(checkReproducibleHash(reorderedHash === expectedHash).passed).toBe(true);
    });
  });
});
