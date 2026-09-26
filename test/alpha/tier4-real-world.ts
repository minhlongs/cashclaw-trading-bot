import { describe, expect, it } from 'vitest';
import {
  AUTOMATED_CEILING,
  getTransition,
  isTerminalPhase,
  transitionStrategy,
  type StrategyPhase,
} from '@/forest/alpha/gate/promotion-states';
import { runOpaquePromotionGate } from './promotion-gate-fixtures';
import {
  createBenchmarkLaggardInput,
  createHighTurnoverScalperInput,
  createInstitutionalMomentumInput,
  createLookaheadLeakerInput,
  createOverfitStrategyInput,
  createPassingGateInput,
  createWindfallStrategyInput,
} from './promotion-gate-generators';

export function registerTier4RealWorldTests(): void {
  describe('Tier 4: Real-World Alpha Evaluation Scenarios (S1-S10)', () => {
    it('S1: Institutional momentum strategy passes all 15 checks and reaches SHADOW eligibility', () => {
      const input = createInstitutionalMomentumInput();
      const result = runOpaquePromotionGate(input);

      expect(result.passed).toBe(true);
      expect(result.verdict).toBe('PASSED');
      expect(result.checks).toHaveLength(15);
      expect(result.failedChecks).toHaveLength(0);
      expect(result.diagnosticReasons).toHaveLength(0);

      const checkNames = result.checks.map((c) => c.name);
      expect(checkNames).toContain('min_trades');
      expect(checkNames).toContain('min_net_expectancy');
      expect(checkNames).toContain('min_profit_factor');
      expect(checkNames).toContain('max_drawdown');
      expect(checkNames).toContain('min_sharpe_sortino');
      expect(checkNames).toContain('min_regime_coverage');
      expect(checkNames).toContain('fee_stress');
      expect(checkNames).toContain('slippage_stress');
      expect(checkNames).toContain('parameter_robustness');
      expect(checkNames).toContain('cross_period_robustness');
      expect(checkNames).toContain('cross_asset_robustness');
      expect(checkNames).toContain('leakage_invariance');
      expect(checkNames).toContain('no_single_window_dependency');
      expect(checkNames).toContain('baseline_comparison');
      expect(checkNames).toContain('reproducible_hash');
    });

    it('S2: High-turnover scalper fails under conservative fee and extreme slippage stress', () => {
      const input = createHighTurnoverScalperInput();
      const result = runOpaquePromotionGate(input);

      expect(result.passed).toBe(false);
      expect(result.verdict).toBe('KILLED');
      const failedNames = result.failedChecks.map((c) => c.name);
      expect(failedNames).toContain('fee_stress');
      expect(failedNames).toContain('slippage_stress');
      expect(result.diagnosticReasons.some((r) => r.includes('EXTREME: -6200.00'))).toBe(true);
    });

    it('S3: Overfit curve-fit strategy fails parameter sensitivity and OOS walk-forward consistency', () => {
      const input = createOverfitStrategyInput();
      const result = runOpaquePromotionGate(input);

      expect(result.passed).toBe(false);
      expect(result.verdict).toBe('KILLED');
      const failedNames = result.failedChecks.map((c) => c.name);
      expect(failedNames).toContain('parameter_robustness');
      expect(failedNames).toContain('cross_period_robustness');
    });

    it('S4: Windfall profit strategy fails anti-dependency gate on single lucky OOS window', () => {
      const input = createWindfallStrategyInput();
      const result = runOpaquePromotionGate(input);

      expect(result.passed).toBe(false);
      expect(result.verdict).toBe('KILLED');
      const failedNames = result.failedChecks.map((c) => c.name);
      expect(failedNames).toContain('no_single_window_dependency');
      expect(result.diagnosticReasons.some((r) => r.includes('no_single_window_dependency'))).toBe(true);
    });

    it('S5: Lookahead leaker is caught by mutation invariance and rejected unconditionally', () => {
      const input = createLookaheadLeakerInput();
      const result = runOpaquePromotionGate(input);

      expect(result.passed).toBe(false);
      expect(result.verdict).toBe('KILLED');
      const failedNames = result.failedChecks.map((c) => c.name);
      expect(failedNames).toContain('leakage_invariance');
      expect(result.diagnosticReasons.some((r) => r.includes('Observed 12 lookahead leakage mutations'))).toBe(true);
    });

    it('S6: Benchmark laggard fails Buy & Hold comparison in strong trending market', () => {
      const input = createBenchmarkLaggardInput();
      const result = runOpaquePromotionGate(input);

      expect(result.passed).toBe(false);
      expect(result.verdict).toBe('KILLED');
      const failedNames = result.failedChecks.map((c) => c.name);
      expect(failedNames).toContain('baseline_comparison');
      expect(result.diagnosticReasons.some((r) => r.includes('baseline_comparison'))).toBe(true);
    });

    it('S7: State machine strictly caps automated progression at SHADOW and rejects automated LIVE', () => {
      expect(AUTOMATED_CEILING).toBe('SHADOW');

      let currentPhase: StrategyPhase = 'RESEARCH';
      const automatedSteps: readonly StrategyPhase[] = [
        'BACKTEST',
        'OOS_PASS',
        'ROBUSTNESS_PASS',
        'PAPER',
        'SHADOW',
      ];

      for (const expectedNext of automatedSteps) {
        const res = transitionStrategy(currentPhase, { type: 'gate_passed' });
        expect(res.to).toBe(expectedNext);
        currentPhase = res.to;
      }
      expect(currentPhase).toBe('SHADOW');

      expect(getTransition('SHADOW', { type: 'gate_passed' })).toBeNull();
      expect(() => transitionStrategy('SHADOW', { type: 'gate_passed' })).toThrow(/Invalid transition: SHADOW \+ gate_passed/);

      expect(getTransition('SHADOW', { type: 'promote' })).toBeNull();
      expect(() => transitionStrategy('SHADOW', { type: 'promote' })).toThrow(/Invalid transition: SHADOW \+ promote/);

      const toApproval = transitionStrategy('SHADOW', { type: 'manual_approval', approved: true });
      expect(toApproval.to).toBe('MANUAL_APPROVAL');

      const toLive = transitionStrategy('MANUAL_APPROVAL', { type: 'promote' });
      expect(toLive.to).toBe('LIVE');

      expect(isTerminalPhase('LIVE')).toBe(true);
      expect(getTransition('LIVE', { type: 'promote' })).toBeNull();
      expect(getTransition('LIVE', { type: 'gate_passed' })).toBeNull();
      expect(() => transitionStrategy('LIVE', { type: 'demote' })).toThrow(/Invalid transition: LIVE \+ demote/);
    });

    it('S8: Multi-asset trend-follower validates cross-asset consistency across 4 correlated pairs', () => {
      const input = createPassingGateInput({
        crossAsset: { positiveAssetFraction: 1.0, applicable: true },
      });
      const result = runOpaquePromotionGate(input);
      expect(result.passed).toBe(true);
      const crossAssetCheck = result.checks.find((c) => c.name === 'cross_asset_robustness');
      expect(crossAssetCheck?.passed).toBe(true);
      expect(crossAssetCheck?.actual).toBe(1.0);
    });

    it('S9: Volatility-breakout strategy with downside asymmetry fails Sortino check', () => {
      const input = createPassingGateInput({
        sharpe: 1.45,
        sortino: 1.05,
      });
      const result = runOpaquePromotionGate(input);
      expect(result.passed).toBe(false);
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.some((c) => c.name === 'min_sharpe_sortino')).toBe(true);
    });

    it('S10: Full post-mortem diagnostic generation when strategy fails multiple stress gates', () => {
      const input = createPassingGateInput({
        numTrades: 18,
        expectancy: -0.001,
        maxDrawdown: 0.35,
        leakageViolations: 2,
      });
      const result = runOpaquePromotionGate(input);
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.length).toBe(4);
      expect(result.diagnosticReasons).toHaveLength(4);
      expect(result.diagnosticReasons.some((d) => d.includes('min_trades'))).toBe(true);
      expect(result.diagnosticReasons.some((d) => d.includes('leakage_invariance'))).toBe(true);
    });
  });
}
