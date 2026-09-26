import { describe, expect, it } from 'vitest';
import {
  AUTOMATED_CEILING,
  getTransition,
  isTerminalPhase,
  transitionStrategy,
} from '@/forest/alpha/gate/promotion-states';
import {
  computeCanonicalSha256,
  evalBaselineComparison,
  evalLeakageInvariance,
  evalNoSingleWindowDependency,
  evalReproducibleHash,
  runOpaquePromotionGate,
} from './promotion-gate-fixtures';
import { createPassingGateInput } from './promotion-gate-generators';

export function registerTier1RobustnessTests(): void {
  describe('Tier 1: Feature Coverage — Invariance, Baseline, Hash & Safety (F12-F17)', () => {
    describe('F12: leakageInvariance (Causal Zero Lookahead)', () => {
      it('passes when exactly zero mutations are observed', () => {
        const check = evalLeakageInvariance(0);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(0);
      });

      it('fails when a single decision is mutated', () => {
        const check = evalLeakageInvariance(1);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('Observed 1 lookahead leakage mutations');
      });

      it('fails when multiple decisions are mutated', () => {
        const check = evalLeakageInvariance(15);
        expect(check.passed).toBe(false);
      });

      it('fails when mutation count is negative or non-integer', () => {
        const checkNeg = evalLeakageInvariance(-1);
        const checkFloat = evalLeakageInvariance(2.5);
        expect(checkNeg.passed).toBe(false);
        expect(checkFloat.passed).toBe(false);
      });

      it('threshold is strictly 0', () => {
        const check = evalLeakageInvariance(0);
        expect(check.threshold).toBe(0);
      });
    });

    describe('F13: noSingleWindowDependency (Anti-Windfall Luck <= 50%)', () => {
      it('passes when max single window contributes <= 50% across multiple windows', () => {
        const check = evalNoSingleWindowDependency([2000, 2500, 2200, 1800, 2500], 0.50);
        expect(check.passed).toBe(true);
        expect(check.actual).toBeCloseTo(2500 / 11000, 4);
      });

      it('passes when max window contributes exactly 50%', () => {
        const check = evalNoSingleWindowDependency([500, 250, 250], 0.50);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(0.50);
      });

      it('fails when max window contributes > 50%', () => {
        const check = evalNoSingleWindowDependency([800, 100, 100], 0.50);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('80.0% vs. max 50%');
      });

      it('fails automatically when only 1 window is evaluated', () => {
        const check = evalNoSingleWindowDependency([5000], 0.50);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('Single window is not a promotion signal');
      });

      it('fails when total PnL across windows is zero or negative', () => {
        const check = evalNoSingleWindowDependency([100, -200, 50], 0.50);
        expect(check.passed).toBe(false);
      });
    });

    describe('F14: baselineComparison (Outperforms Buy & Hold and Random)', () => {
      it('passes when candidate strictly outperforms both baselines on Sharpe and Net PnL', () => {
        const check = evalBaselineComparison(
          { sharpe: 1.8, netPnl: 15000 },
          { sharpe: 0.9, netPnl: 8000 },
          { sharpe: -0.1, netPnl: -500 },
        );
        expect(check.passed).toBe(true);
      });

      it('fails when candidate lags Buy & Hold Sharpe ratio despite higher Net PnL', () => {
        const check = evalBaselineComparison(
          { sharpe: 1.2, netPnl: 20000 },
          { sharpe: 1.5, netPnl: 15000 },
          { sharpe: 0.0, netPnl: 0 },
        );
        expect(check.passed).toBe(false);
      });

      it('fails when candidate lags Buy & Hold Net PnL despite higher Sharpe ratio', () => {
        const check = evalBaselineComparison(
          { sharpe: 2.1, netPnl: 8000 },
          { sharpe: 1.4, netPnl: 12000 },
          { sharpe: 0.0, netPnl: 0 },
        );
        expect(check.passed).toBe(false);
      });

      it('fails when candidate lags Random Entry on either metric', () => {
        const check = evalBaselineComparison(
          { sharpe: 0.8, netPnl: 1000 },
          { sharpe: 0.5, netPnl: 500 },
          { sharpe: 1.1, netPnl: 1200 },
        );
        expect(check.passed).toBe(false);
      });

      it('passes when baseline Sharpe is null and candidate Sharpe is positive', () => {
        const check = evalBaselineComparison(
          { sharpe: 1.5, netPnl: 5000 },
          { sharpe: null, netPnl: 2000 },
          { sharpe: null, netPnl: -1000 },
        );
        expect(check.passed).toBe(true);
      });
    });

    describe('F15: reproducibleHash (Deterministic Cryptographic Provenance)', () => {
      it('passes when recorded hash matches computed canonical SHA-256 hash', () => {
        const config = { alpha: 'mom-1', window: 20 };
        const gitSha = '0123456789abcdef0123456789abcdef01234567';
        const expected = computeCanonicalSha256({ gitSha, seed: 42, config });
        const check = evalReproducibleHash({ gitSha, seed: 42, config, recordedHash: expected });
        expect(check.passed).toBe(true);
      });

      it('fails when recorded hash does not match computed hash', () => {
        const check = evalReproducibleHash({
          gitSha: 'abcdef1234567890abcdef1234567890abcdef12',
          seed: 42,
          config: { alpha: 'test' },
          recordedHash: '0000000000000000000000000000000000000000000000000000000000000000',
        });
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('Mismatch: recorded');
      });

      it('fails when git commit SHA is missing or empty', () => {
        const check = evalReproducibleHash({ gitSha: '', seed: 1, recordedHash: 'any' });
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('Missing git commit SHA');
      });

      it('is invariant to configuration object key insertion ordering', () => {
        const configA = { b: 2, a: 1 };
        const configB = { a: 1, b: 2 };
        const gitSha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
        const hashA = computeCanonicalSha256({ gitSha, seed: 10, config: configA });
        const check = evalReproducibleHash({ gitSha, seed: 10, config: configB, recordedHash: hashA });
        expect(check.passed).toBe(true);
      });

      it('normalizes lowercase hexadecimal comparisons', () => {
        const config = { x: 1 };
        const gitSha = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
        const hash = computeCanonicalSha256({ gitSha, seed: 1, config });
        const check = evalReproducibleHash({ gitSha, seed: 1, config, recordedHash: hash.toUpperCase() });
        expect(check.passed).toBe(true);
      });
    });

    describe('F16: Conjunctive Evaluation (15/15 All-or-Nothing)', () => {
      it('returns PASSED when all 15 checks pass', () => {
        const input = createPassingGateInput();
        const result = runOpaquePromotionGate(input);
        expect(result.passed).toBe(true);
        expect(result.verdict).toBe('PASSED');
        expect(result.failedChecks).toHaveLength(0);
        expect(result.checks).toHaveLength(15);
      });

      it('returns KILLED when exactly 1 check fails', () => {
        const input = createPassingGateInput({ numTrades: 10 });
        const result = runOpaquePromotionGate(input);
        expect(result.passed).toBe(false);
        expect(result.verdict).toBe('KILLED');
        expect(result.failedChecks).toHaveLength(1);
        expect(result.failedChecks[0].name).toBe('min_trades');
      });

      it('returns KILLED when check 15 fails after 1-14 pass', () => {
        const input = createPassingGateInput({
          hashVerification: { hashMatches: false, recordedHash: 'corrupt' },
        });
        const result = runOpaquePromotionGate(input);
        expect(result.passed).toBe(false);
        expect(result.verdict).toBe('KILLED');
        expect(result.failedChecks.some((c) => c.name === 'reproducible_hash')).toBe(true);
      });

      it('generates structured diagnostic reasons for every failure', () => {
        const input = createPassingGateInput({ numTrades: 15, maxDrawdown: 0.40 });
        const result = runOpaquePromotionGate(input);
        expect(result.diagnosticReasons.length).toBe(2);
        expect(result.diagnosticReasons[0]).toContain('min_trades');
        expect(result.diagnosticReasons[1]).toContain('max_drawdown');
      });

      it('timestamp is populated as a positive epoch number', () => {
        const result = runOpaquePromotionGate(createPassingGateInput());
        expect(result.timestamp).toBeGreaterThan(0);
      });
    });

    describe('F17: Safety Capping at SHADOW (Zero Automated LIVE)', () => {
      it('enforces AUTOMATED_CEILING is strictly SHADOW', () => {
        expect(AUTOMATED_CEILING).toBe('SHADOW');
      });

      it('advances from PAPER to SHADOW on gate_passed', () => {
        const next = getTransition('PAPER', { type: 'gate_passed' });
        expect(next).toBe('SHADOW');
      });

      it('rejects automated gate_passed from SHADOW (returns null)', () => {
        const next = getTransition('SHADOW', { type: 'gate_passed' });
        expect(next).toBeNull();
      });

      it('allows transition from SHADOW to MANUAL_APPROVAL only via approved manual_approval', () => {
        const approved = getTransition('SHADOW', { type: 'manual_approval', approved: true });
        const rejected = getTransition('SHADOW', { type: 'manual_approval', approved: false });
        expect(approved).toBe('MANUAL_APPROVAL');
        expect(rejected).toBe('KILLED');
      });

      it('guarantees LIVE and KILLED are terminal sink states', () => {
        expect(isTerminalPhase('LIVE')).toBe(true);
        expect(isTerminalPhase('KILLED')).toBe(true);
        expect(getTransition('LIVE', { type: 'promote' })).toBeNull();
        expect(getTransition('KILLED', { type: 'gate_passed' })).toBeNull();
        expect(() => transitionStrategy('LIVE', { type: 'demote' })).toThrow(/Invalid transition/);
      });
    });
  });
}
