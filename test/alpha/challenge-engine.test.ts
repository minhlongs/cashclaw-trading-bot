import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  runPromotionGate,
  type GateCheckName,
  type PromotionGateInput,
  type FinancialMetricsInput,
  type StressMetricsInput,
  type RobustnessMetricsInput,
} from '../../src/forest/alpha/gate/index';

function createValidCandidate(): PromotionGateInput {
  return {
    financial: {
      numTrades: 50,
      expectancy: 1.5,
      profitFactor: 1.8,
      maxDrawdown: 0.15,
      sharpe: 1.8,
      sortino: 2.1,
      byRegime: { bull: { numTrades: 25, netPnl: 500 }, bear: { numTrades: 25, netPnl: 300 } },
    },
    stress: { netPnlNormal: 400, netPnlConservative: 250, netPnlAdverse: 200, netPnlExtreme: 50 },
    robustness: {
      parameterSpread: 0.2,
      crossPeriodPositiveFraction: 0.8,
      crossAssetPositiveFraction: 0.7,
      crossAssetApplicable: true,
      leakageViolations: 0,
      windowPnls: [100, 100, 100],
      baselineCandidate: { sharpe: 1.8, netPnl: 500 },
      baselineBuyHold: { sharpe: 0.8, netPnl: 200 },
      baselineRandomEntry: { sharpe: 0.1, netPnl: 50 },
      hashMatches: true,
      hashDetails: { recordedHash: 'sha_emp_001', expectedHash: 'sha_emp_001' },
    },
  };
}

function candidateWith(overrides: {
  financial?: Partial<FinancialMetricsInput>;
  stress?: Partial<StressMetricsInput>;
  robustness?: Partial<RobustnessMetricsInput>;
}): PromotionGateInput {
  const base = createValidCandidate();
  return {
    financial: { ...base.financial, ...(overrides.financial ?? {}) },
    stress: { ...base.stress, ...(overrides.stress ?? {}) },
    robustness: { ...base.robustness, ...(overrides.robustness ?? {}) },
  };
}

interface Mutation {
  name: GateCheckName;
  desc: string;
  create: () => PromotionGateInput;
}

const mutations: readonly Mutation[] = [
  { name: 'min_trades', desc: 'numTrades 29 < 30', create: () => candidateWith({ financial: { numTrades: 29 } }) },
  { name: 'min_net_expectancy', desc: 'expectancy 0.0 not > 0', create: () => candidateWith({ financial: { expectancy: 0.0 } }) },
  { name: 'min_profit_factor', desc: 'PF 1.19 < 1.20', create: () => candidateWith({ financial: { profitFactor: 1.19 } }) },
  { name: 'max_drawdown', desc: 'MDD 0.251 > 0.25', create: () => candidateWith({ financial: { maxDrawdown: 0.251 } }) },
  { name: 'min_sharpe_sortino', desc: 'Sharpe 0.99 < 1.0', create: () => candidateWith({ financial: { sharpe: 0.99 } }) },
  {
    name: 'min_regime_coverage',
    desc: '1/3 regimes profitable (< 50%)',
    create: () => candidateWith({
      financial: {
        byRegime: {
          r1: { numTrades: 10, netPnl: 100 },
          r2: { numTrades: 10, netPnl: -20 },
          r3: { numTrades: 10, netPnl: -30 },
        },
      },
    }),
  },
  { name: 'fee_stress', desc: 'conservative PnL 0', create: () => candidateWith({ stress: { netPnlConservative: 0 } }) },
  { name: 'slippage_stress', desc: 'extreme PnL 0', create: () => candidateWith({ stress: { netPnlExtreme: 0 } }) },
  { name: 'parameter_robustness', desc: 'spread 0.501 > 0.50', create: () => candidateWith({ robustness: { parameterSpread: 0.501 } }) },
  { name: 'cross_period_robustness', desc: 'fraction 0.599 < 0.60', create: () => candidateWith({ robustness: { crossPeriodPositiveFraction: 0.599 } }) },
  { name: 'cross_asset_robustness', desc: 'fraction 0.499 < 0.50', create: () => candidateWith({ robustness: { crossAssetPositiveFraction: 0.499 } }) },
  { name: 'leakage_invariance', desc: 'violations 1 !== 0', create: () => candidateWith({ robustness: { leakageViolations: 1 } }) },
  { name: 'no_single_window_dependency', desc: 'window 90% > 50%', create: () => candidateWith({ robustness: { windowPnls: [90, 5, 5] } }) },
  { name: 'baseline_comparison', desc: 'Sharpe 0.5 <= BH 0.8', create: () => candidateWith({ robustness: { baselineCandidate: { sharpe: 0.5, netPnl: 500 } } }) },
  { name: 'reproducible_hash', desc: 'hashMatches false', create: () => candidateWith({ robustness: { hashMatches: false } }) },
];

describe('Adversarial Challenge: Milestone 2 Promotion Gate Engine', () => {
  it('passing candidate yields PASSED, passed: true, and 0 failed checks', () => {
    const res = runPromotionGate(createValidCandidate());
    expect(res.passed).toBe(true);
    expect(res.verdict).toBe('PASSED');
    expect(res.checks).toHaveLength(15);
    expect(res.failedChecks).toHaveLength(0);
    expect(res.diagnosticReasons).toHaveLength(0);
    expect(res.checks.every((c) => c.passed)).toBe(true);
    expect(res.timestamp).toBeGreaterThan(0);
  });

  describe('Conjunctive Discrimination: 15 single-check failure candidates', () => {
    mutations.forEach(({ name, desc, create }) => {
      it(`Check [${name}]: ${desc} yields KILLED and passed: false`, () => {
        const candidate = create();
        const res = runPromotionGate(candidate);
        expect(res.passed).toBe(false);
        expect(res.verdict).toBe('KILLED');
        expect(res.failedChecks).toHaveLength(1);
        expect(res.failedChecks[0].name).toBe(name);
        expect(res.diagnosticReasons).toHaveLength(1);
        expect(res.diagnosticReasons[0]).toContain(`Check [${name}] failed:`);
        expect(res.checks.filter((c) => c.passed)).toHaveLength(14);
      });
    });
  });

  it('candidate failing all 15 checks yields all 15 in failedChecks and diagnostics', () => {
    const failingCandidate: PromotionGateInput = {
      financial: {
        numTrades: 10, expectancy: -0.5, profitFactor: 0.9, maxDrawdown: 0.4,
        sharpe: 0.5, sortino: 0.5, byRegime: { r1: { numTrades: 10, netPnl: -50 } },
      },
      stress: { netPnlNormal: -10, netPnlConservative: -20, netPnlAdverse: -30, netPnlExtreme: -50 },
      robustness: {
        parameterSpread: 0.8, crossPeriodPositiveFraction: 0.2, crossAssetPositiveFraction: 0.2,
        crossAssetApplicable: true, leakageViolations: 3, windowPnls: [100],
        baselineCandidate: { sharpe: 0.1, netPnl: 10 },
        baselineBuyHold: { sharpe: 1.0, netPnl: 100 },
        baselineRandomEntry: { sharpe: 0.5, netPnl: 50 }, hashMatches: false,
      },
    };
    const res = runPromotionGate(failingCandidate);
    expect(res.passed).toBe(false);
    expect(res.verdict).toBe('KILLED');
    expect(res.checks).toHaveLength(15);
    expect(res.failedChecks).toHaveLength(15);
    expect(res.diagnosticReasons).toHaveLength(15);
    const failedNames = res.failedChecks.map((c) => c.name);
    for (const m of mutations) {
      expect(failedNames).toContain(m.name);
    }
  });

  it('config overrides: tightened and relaxed thresholds behave conjunctive and fail-closed', () => {
    const base = createValidCandidate();
    expect(runPromotionGate(base, { minTrades: 60 }).failedChecks[0].name).toBe('min_trades');
    expect(runPromotionGate(base, { maxDrawdown: 0.1 }).failedChecks[0].name).toBe('max_drawdown');
    expect(runPromotionGate(base, { minSharpe: 2.5 }).failedChecks[0].name).toBe('min_sharpe_sortino');

    const lowTrades = candidateWith({ financial: { numTrades: 25 } });
    expect(runPromotionGate(lowTrades).passed).toBe(false);
    const rRelaxed = runPromotionGate(lowTrades, { minTrades: 20 });
    expect(rRelaxed.passed).toBe(true);
    expect(rRelaxed.verdict).toBe('PASSED');

    expect(() => runPromotionGate(base, { minTrades: 0 })).toThrow(ZodError);
    expect(() => runPromotionGate(base, { minProfitFactor: -1 })).toThrow(ZodError);
    expect(() => runPromotionGate(base, { maxDrawdown: 1.5 })).toThrow(ZodError);
    expect(() => runPromotionGate(base, { rogue: 'illegal' } as unknown as object)).toThrow(ZodError);
  });

  it('fail-closed structural boundary: rejects malformed input and validates edge cases', () => {
    const base = createValidCandidate();
    expect(() => runPromotionGate({} as unknown as PromotionGateInput)).toThrow(ZodError);
    expect(() => runPromotionGate({ ...base, rogue: true } as unknown as PromotionGateInput)).toThrow(ZodError);
    expect(() => runPromotionGate({ ...base, financial: { ...base.financial, numTrades: 50.5 } })).toThrow(ZodError);

    const emptyWin = candidateWith({ robustness: { windowPnls: [] } });
    expect(runPromotionGate(emptyWin).failedChecks[0].name).toBe('no_single_window_dependency');

    const negWin = candidateWith({ robustness: { windowPnls: [-100, -200] } });
    expect(runPromotionGate(negWin).failedChecks[0].name).toBe('no_single_window_dependency');

    const exempt = candidateWith({ robustness: { crossAssetApplicable: false, crossAssetPositiveFraction: null } });
    const rExempt = runPromotionGate(exempt);
    expect(rExempt.passed).toBe(true);
    expect(rExempt.checks.find((c) => c.name === 'cross_asset_robustness')?.detail).toContain('Exempted');
  });
});
