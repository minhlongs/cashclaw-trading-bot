import { describe, expect, it } from 'vitest';
import {
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

export function registerTier2RobustnessTests(): void {
  describe('Tier 2: Boundary & Corner Cases — Invariance, Baseline, Hash & Safety (F12-F17)', () => {
    describe('F12: leakageInvariance Boundary Values', () => {
      it('passes at exactly 0 mutations (strict zero-tolerance)', () => {
        expect(evalLeakageInvariance(0).passed).toBe(true);
      });

      it('fails at exactly 1 mutation (any leakage is fatal)', () => {
        expect(evalLeakageInvariance(1).passed).toBe(false);
      });

      it('fails at 2 mutations', () => {
        expect(evalLeakageInvariance(2).passed).toBe(false);
      });

      it('fails when mutation count is fractional 0.5', () => {
        expect(evalLeakageInvariance(0.5).passed).toBe(false);
      });

      it('fails when mutation count is negative -1', () => {
        expect(evalLeakageInvariance(-1).passed).toBe(false);
      });
    });

    describe('F13: noSingleWindowDependency Boundary Values', () => {
      it('passes when max single window contributes exactly 50.0% (500 / 1000)', () => {
        expect(evalNoSingleWindowDependency([500, 500], 0.50).passed).toBe(true);
      });

      it('fails when max single window contributes 50.1% (501 / 1000)', () => {
        expect(evalNoSingleWindowDependency([501, 499], 0.50).passed).toBe(false);
      });

      it('passes when max single window contributes 49.9% (499 / 1000)', () => {
        expect(evalNoSingleWindowDependency([499, 251, 250], 0.50).passed).toBe(true);
      });

      it('fails when only 1 window is evaluated regardless of PnL value', () => {
        expect(evalNoSingleWindowDependency([100000], 0.50).passed).toBe(false);
      });

      it('passes with 4 equal windows contributing 25.0% each', () => {
        expect(evalNoSingleWindowDependency([250, 250, 250, 250], 0.50).passed).toBe(true);
      });
    });

    describe('F14: baselineComparison Boundary Values', () => {
      it('passes with marginal positive alpha 0.0001 on Sharpe and Net PnL over Buy & Hold', () => {
        const check = evalBaselineComparison(
          { sharpe: 1.0001, netPnl: 10001 },
          { sharpe: 1.0000, netPnl: 10000 },
          { sharpe: 0.0, netPnl: 0 },
        );
        expect(check.passed).toBe(true);
      });

      it('fails when candidate ties Buy & Hold Sharpe exactly (strict > required)', () => {
        const check = evalBaselineComparison(
          { sharpe: 1.0000, netPnl: 10001 },
          { sharpe: 1.0000, netPnl: 10000 },
          { sharpe: 0.0, netPnl: 0 },
        );
        expect(check.passed).toBe(false);
      });

      it('fails when candidate ties Buy & Hold Net PnL exactly (strict > required)', () => {
        const check = evalBaselineComparison(
          { sharpe: 1.2000, netPnl: 10000 },
          { sharpe: 1.0000, netPnl: 10000 },
          { sharpe: 0.0, netPnl: 0 },
        );
        expect(check.passed).toBe(false);
      });

      it('fails when candidate ties Random Entry on either Sharpe or Net PnL', () => {
        const check = evalBaselineComparison(
          { sharpe: 1.5, netPnl: 5000 },
          { sharpe: 0.5, netPnl: 2000 },
          { sharpe: 1.5, netPnl: 4000 },
        );
        expect(check.passed).toBe(false);
      });

      it('passes when candidate beats Random Entry by 0.0001 on both metrics', () => {
        const check = evalBaselineComparison(
          { sharpe: 1.5001, netPnl: 5001 },
          { sharpe: 0.5, netPnl: 2000 },
          { sharpe: 1.5000, netPnl: 5000 },
        );
        expect(check.passed).toBe(true);
      });
    });

    describe('F15: reproducibleHash Boundary Values', () => {
      it('passes with exact 64-character lowercase hexadecimal hash', () => {
        const config = { seed: 1 };
        const gitSha = '1111111111111111111111111111111111111111';
        const recordedHash = computeCanonicalSha256({ gitSha, seed: 1, config });
        expect(evalReproducibleHash({ gitSha, seed: 1, config, recordedHash }).passed).toBe(true);
      });

      it('fails when exactly 1 hex character is altered in hash', () => {
        const config = { seed: 1 };
        const gitSha = '1111111111111111111111111111111111111111';
        const hash = computeCanonicalSha256({ gitSha, seed: 1, config });
        const altered = (hash.startsWith('a') ? 'b' : 'a') + hash.slice(1);
        expect(evalReproducibleHash({ gitSha, seed: 1, config, recordedHash: altered }).passed).toBe(false);
      });

      it('passes when hash is provided in uppercase (case-insensitive normalization)', () => {
        const config = { k: 'val' };
        const gitSha = '2222222222222222222222222222222222222222';
        const hash = computeCanonicalSha256({ gitSha, seed: 0, config });
        expect(evalReproducibleHash({ gitSha, seed: 0, config, recordedHash: hash.toUpperCase() }).passed).toBe(true);
      });

      it('fails when git commit SHA is whitespace only', () => {
        expect(evalReproducibleHash({ gitSha: '   ', seed: 1, recordedHash: 'h' }).passed).toBe(false);
      });

      it('passes with empty configuration object {}', () => {
        const gitSha = '3333333333333333333333333333333333333333';
        const recordedHash = computeCanonicalSha256({ gitSha, seed: 0, config: {} });
        expect(evalReproducibleHash({ gitSha, seed: 0, config: {}, recordedHash }).passed).toBe(true);
      });
    });

    describe('F16: Conjunctive Evaluation Boundary Scenarios', () => {
      it('fails with KILLED when 14 of 15 checks pass and 1 fails', () => {
        const input = createPassingGateInput({ numTrades: 29 });
        const result = runOpaquePromotionGate(input);
        expect(result.verdict).toBe('KILLED');
        expect(result.failedChecks).toHaveLength(1);
      });

      it('passes with PASSED when all 15 of 15 checks pass', () => {
        const input = createPassingGateInput();
        const result = runOpaquePromotionGate(input);
        expect(result.verdict).toBe('PASSED');
        expect(result.failedChecks).toHaveLength(0);
      });

      it('fails with KILLED when all 15 checks fail simultaneously', () => {
        const input = createPassingGateInput({
          numTrades: 5,
          expectancy: -0.1,
          profitFactor: 0.5,
          maxDrawdown: 0.80,
          sharpe: -0.5,
          sortino: -0.2,
          byRegime: {},
          feeStress: { netPnlNormal: -100, netPnlConservative: -200 },
          slippageStress: { netPnlAdverse: -300, netPnlExtreme: -500 },
          parameterSensitivitySpread: 0.95,
          walkForwardPositiveFraction: 0.10,
          crossAsset: { positiveAssetFraction: 0.10, applicable: true },
          leakageViolations: 8,
          windowPnls: [5000],
          baselineComparison: {
            candidate: { sharpe: 0.2, netPnl: 100 },
            buyHold: { sharpe: 1.5, netPnl: 5000 },
            randomEntry: { sharpe: 0.8, netPnl: 1000 },
          },
          hashVerification: { hashMatches: false },
        });
        const result = runOpaquePromotionGate(input);
        expect(result.verdict).toBe('KILLED');
        expect(result.failedChecks).toHaveLength(15);
      });

      it('reports exact list of failed check names in diagnostic reasons', () => {
        const input = createPassingGateInput({
          numTrades: 20,
          maxDrawdown: 0.35,
          leakageViolations: 3,
        });
        const result = runOpaquePromotionGate(input);
        expect(result.failedChecks.map((f) => f.name)).toEqual([
          'min_trades',
          'max_drawdown',
          'leakage_invariance',
        ]);
      });

      it('honors custom threshold overrides passed in config', () => {
        const input = createPassingGateInput({ numTrades: 25 });
        const result = runOpaquePromotionGate(input, { minTrades: 20 });
        expect(result.passed).toBe(true);
      });
    });

    describe('F17: Safety Capping Boundary Transitions', () => {
      it('returns null on gate_passed from SHADOW', () => {
        expect(getTransition('SHADOW', { type: 'gate_passed' })).toBeNull();
      });

      it('returns null on promote from SHADOW', () => {
        expect(getTransition('SHADOW', { type: 'promote' })).toBeNull();
      });

      it('transitions from SHADOW to KILLED on rejected manual approval', () => {
        const next = getTransition('SHADOW', { type: 'manual_approval', approved: false });
        expect(next).toBe('KILLED');
      });

      it('demotes from SHADOW back to RESEARCH', () => {
        const next = getTransition('SHADOW', { type: 'demote' });
        expect(next).toBe('RESEARCH');
      });

      it('guarantees no trigger can move KILLED to any other state', () => {
        expect(isTerminalPhase('KILLED')).toBe(true);
        expect(getTransition('KILLED', { type: 'gate_passed' })).toBeNull();
        expect(getTransition('KILLED', { type: 'demote' })).toBeNull();
        expect(() => transitionStrategy('KILLED', { type: 'gate_passed' })).toThrow(/Invalid transition/);
      });
    });
  });
}
