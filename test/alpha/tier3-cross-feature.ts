import { describe, expect, it } from 'vitest';
import { getTransition, transitionStrategy } from '@/forest/alpha/gate/promotion-states';
import { runOpaquePromotionGate } from './promotion-gate-fixtures';
import { createPassingGateInput } from './promotion-gate-generators';

export function registerTier3CrossFeatureTests(): void {
  describe('Tier 3: Cross-Feature Interactions & Pairwise Combinations (P1-P20)', () => {
    it('P1: passing Sharpe (2.20) but failing Sortino (1.10) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ sharpe: 2.20, sortino: 1.10 }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toContain('min_sharpe_sortino');
    });
    it('P2: passing Sortino (2.50) but failing Sharpe (0.85) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ sharpe: 0.85, sortino: 2.50 }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toContain('min_sharpe_sortino');
    });
    it('P3: passing all financial checks (F1-F6) but failing extreme slippage stress (100 bps) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ slippageStress: { netPnlAdverse: 500, netPnlExtreme: -1200 } }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['slippage_stress']);
    });
    it('P4: passing all financial checks (F1-F6) but failing conservative fee stress kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ feeStress: { netPnlNormal: 1500, netPnlConservative: -250 } }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['fee_stress']);
    });
    it('P5: passing cross-period robustness (80%) but failing single-window dependency (92%) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ walkForwardPositiveFraction: 0.80, windowPnls: [18400, 400, 400, 400, 400] }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['no_single_window_dependency']);
    });
    it('P6: passing single-window dependency (28%) but failing cross-period robustness (35%) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ walkForwardPositiveFraction: 0.35, windowPnls: [280, 250, 240, 230] }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['cross_period_robustness']);
    });
    it('P7: passing 14 checks but failing reproducible hash provenance kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({
        hashVerification: { gitSha: 'abcdef1234567890abcdef1234567890abcdef12', seed: 42, config: { alpha: 'tampered' }, recordedHash: '1'.repeat(64) },
      }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['reproducible_hash']);
    });
    it('P8: passing 14 checks but failing leakage invariance (1 mutated decision) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ leakageViolations: 1 }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['leakage_invariance']);
    });
    it('P9: low parameter sensitivity spread (0.15) but failing OOS walk-forward (40%) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ parameterSensitivitySpread: 0.15, walkForwardPositiveFraction: 0.40 }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['cross_period_robustness']);
    });
    it('P10: beating Random Entry but losing to Buy & Hold on Sharpe ratio kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({
        baselineComparison: { candidate: { sharpe: 1.25, netPnl: 18000 }, buyHold: { sharpe: 1.65, netPnl: 12000 }, randomEntry: { sharpe: -0.20, netPnl: -1000 } },
      }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['baseline_comparison']);
    });
    it('P11: beating Buy & Hold on Net PnL but losing on Sharpe ratio kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({
        baselineComparison: { candidate: { sharpe: 1.10, netPnl: 25000 }, buyHold: { sharpe: 1.40, netPnl: 20000 }, randomEntry: { sharpe: 0.0, netPnl: 0 } },
      }));
      expect(result.verdict).toBe('KILLED');
    });
    it('P12: 500 trades and 2.5 profit factor but negative net expectancy (-0.005) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ numTrades: 500, profitFactor: 2.5, expectancy: -0.005 }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toContain('min_net_expectancy');
    });
    it('P13: high expectancy ($50) but exceeding max drawdown (32% > 25%) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ expectancy: 50.0, maxDrawdown: 0.32 }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['max_drawdown']);
    });
    it('P14: surviving fee and slippage stress but failing regime coverage (25% profitable) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({
        byRegime: { R1: { numTrades: 20, netPnl: 1000 }, R2: { numTrades: 20, netPnl: -500 }, R3: { numTrades: 20, netPnl: -200 }, R4: { numTrades: 20, netPnl: -400 } },
      }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['min_regime_coverage']);
    });
    it('P15: asset-specific strategy with applicable=false exemption passes to PASSED', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ crossAsset: { positiveAssetFraction: 0.0, applicable: false } }));
      expect(result.verdict).toBe('PASSED');
      expect(result.failedChecks).toHaveLength(0);
    });
    it('P16: low drawdown (5%) and 2.0 profit factor but failing minTrades (12 trades) kills strategy', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ numTrades: 12, maxDrawdown: 0.05, profitFactor: 2.0 }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.map((f) => f.name)).toEqual(['min_trades']);
    });
    it('P17: zero drawdown (0%) but zero trades (0 trades) is killed by minTrades', () => {
      const result = runOpaquePromotionGate(createPassingGateInput({ numTrades: 0, maxDrawdown: 0.0 }));
      expect(result.verdict).toBe('KILLED');
      expect(result.failedChecks.some((f) => f.name === 'min_trades')).toBe(true);
    });
    it('P18: passing all 15 checks produces trigger that advances pipeline to SHADOW', () => {
      expect(runOpaquePromotionGate(createPassingGateInput()).verdict).toBe('PASSED');
      const phases = ['RESEARCH', 'BACKTEST', 'OOS_PASS', 'ROBUSTNESS_PASS', 'PAPER', 'SHADOW'] as const;
      for (let i = 0; i < phases.length - 1; i++) {
        expect(transitionStrategy(phases[i], { type: 'gate_passed' }).to).toBe(phases[i + 1]);
      }
    });
    it('P19: killed gate result maps to gate_failed trigger terminating lifecycle', () => {
      expect(runOpaquePromotionGate(createPassingGateInput({ numTrades: 10 })).verdict).toBe('KILLED');
      expect(transitionStrategy('RESEARCH', { type: 'gate_failed' }).to).toBe('KILLED');
    });
    it('P20: passing all 15 checks capped at SHADOW with zero automated transition to LIVE', () => {
      expect(runOpaquePromotionGate(createPassingGateInput()).verdict).toBe('PASSED');
      expect(getTransition('SHADOW', { type: 'gate_passed' })).toBeNull();
      expect(getTransition('SHADOW', { type: 'promote' })).toBeNull();
    });
  });
}
