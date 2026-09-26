import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  runPromotionGate,
  DEFAULT_PROMOTION_GATE_CONFIG,
  PromotionGateInputSchema,
  type PromotionGateInput,
} from '../../src/forest/alpha/gate/index';

function createPassingInput(): PromotionGateInput {
  return {
    financial: {
      numTrades: 45,
      expectancy: 12.5,
      profitFactor: 1.75,
      maxDrawdown: 0.15,
      sharpe: 1.5,
      sortino: 1.9,
      byRegime: {
        bull: { numTrades: 25, netPnl: 600 },
        bear: { numTrades: 20, netPnl: 400 },
      },
    },
    stress: {
      netPnlNormal: 500,
      netPnlConservative: 350,
      netPnlAdverse: 250,
      netPnlExtreme: 100,
    },
    robustness: {
      parameterSpread: 0.25,
      crossPeriodPositiveFraction: 0.75,
      crossAssetPositiveFraction: 0.65,
      crossAssetApplicable: true,
      leakageViolations: 0,
      windowPnls: [300, 300, 200],
      baselineCandidate: { sharpe: 1.5, netPnl: 800 },
      baselineBuyHold: { sharpe: 1.0, netPnl: 400 },
      baselineRandomEntry: { sharpe: 0.1, netPnl: 50 },
      hashMatches: true,
      hashDetails: { recordedHash: 'sha_test_123', expectedHash: 'sha_test_123' },
    },
  };
}

describe('Conjunctive Promotion Gate Engine (runPromotionGate)', () => {
  it('15/15 passing candidate -> PASSED verdict with zero failed checks', () => {
    const input = createPassingInput();
    const result = runPromotionGate(input);

    expect(DEFAULT_PROMOTION_GATE_CONFIG.minTrades).toBe(30);
    expect(PromotionGateInputSchema.safeParse(input).success).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.verdict).toBe('PASSED');
    expect(result.checks).toHaveLength(15);
    expect(result.checks.every((c) => c.passed)).toBe(true);
    expect(result.failedChecks).toHaveLength(0);
    expect(result.diagnosticReasons).toHaveLength(0);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('single check failure -> KILLED verdict with exact diagnostic reason', () => {
    const base = createPassingInput();
    const inputTrades: PromotionGateInput = {
      ...base,
      financial: { ...base.financial, numTrades: 28 },
    };
    const resTrades = runPromotionGate(inputTrades);
    expect(resTrades.passed).toBe(false);
    expect(resTrades.verdict).toBe('KILLED');
    expect(resTrades.failedChecks).toHaveLength(1);
    expect(resTrades.failedChecks[0].name).toBe('min_trades');
    expect(resTrades.diagnosticReasons).toEqual([
      'Check [min_trades] failed: 28 trades vs. minimum 30',
    ]);

    const inputLeakage: PromotionGateInput = {
      ...base,
      robustness: { ...base.robustness, leakageViolations: 2 },
    };
    const resLeakage = runPromotionGate(inputLeakage);
    expect(resLeakage.passed).toBe(false);
    expect(resLeakage.verdict).toBe('KILLED');
    expect(resLeakage.failedChecks[0].name).toBe('leakage_invariance');
    expect(resLeakage.diagnosticReasons[0]).toContain(
      'Check [leakage_invariance] failed: Lookahead leakage detected: 2 mutated historical decisions',
    );
  });

  it('multiple check failures -> records all failed checks and structured diagnostics', () => {
    const base = createPassingInput();
    const input: PromotionGateInput = {
      ...base,
      financial: { ...base.financial, expectancy: -0.5, maxDrawdown: 0.35 },
      stress: { ...base.stress, netPnlExtreme: -25 },
      robustness: { ...base.robustness, hashMatches: false },
    };
    const result = runPromotionGate(input);

    expect(result.passed).toBe(false);
    expect(result.verdict).toBe('KILLED');
    expect(result.failedChecks).toHaveLength(4);
    const names = result.failedChecks.map((c) => c.name);
    expect(names).toEqual([
      'min_net_expectancy',
      'max_drawdown',
      'slippage_stress',
      'reproducible_hash',
    ]);
    expect(result.diagnosticReasons).toHaveLength(4);
    expect(result.diagnosticReasons[0]).toContain('min_net_expectancy');
    expect(result.diagnosticReasons[1]).toContain('max_drawdown');
    expect(result.diagnosticReasons[2]).toContain('slippage_stress');
    expect(result.diagnosticReasons[3]).toContain('reproducible_hash');
  });

  it('custom config threshold overrides dynamically change gate hurdle', () => {
    const base = createPassingInput();

    const stricterResult = runPromotionGate(base, { minTrades: 50 });
    expect(stricterResult.passed).toBe(false);
    expect(stricterResult.failedChecks[0].name).toBe('min_trades');

    const strictSharpe = runPromotionGate(base, { minSharpe: 2.0 });
    expect(strictSharpe.passed).toBe(false);
    expect(strictSharpe.failedChecks[0].name).toBe('min_sharpe_sortino');

    const relaxedInput: PromotionGateInput = {
      ...base,
      financial: { ...base.financial, numTrades: 22 },
    };
    expect(runPromotionGate(relaxedInput).passed).toBe(false);
    const relaxedResult = runPromotionGate(relaxedInput, { minTrades: 20 });
    expect(relaxedResult.passed).toBe(true);
    expect(relaxedResult.verdict).toBe('PASSED');
  });

  it('exemption logic for cross-asset robustness operates correctly under engine', () => {
    const base = createPassingInput();
    const inputExempt: PromotionGateInput = {
      ...base,
      robustness: {
        ...base.robustness,
        crossAssetApplicable: false,
        crossAssetPositiveFraction: null,
      },
    };
    const result = runPromotionGate(inputExempt);
    expect(result.passed).toBe(true);
    const crossAssetCheck = result.checks.find((c) => c.name === 'cross_asset_robustness');
    expect(crossAssetCheck?.passed).toBe(true);
    expect(crossAssetCheck?.detail).toBe('Exempted: asset-specific strategy declaration');
  });

  it('malformed input payloads are rejected fail-closed via Zod schemas', () => {
    const base = createPassingInput();

    expect(() =>
      runPromotionGate({ ...base, financial: undefined as unknown as typeof base.financial }),
    ).toThrow(ZodError);

    expect(() =>
      runPromotionGate({
        ...base,
        financial: { ...base.financial, numTrades: 30.5 },
      }),
    ).toThrow(ZodError);

    expect(() =>
      runPromotionGate({
        ...base,
        stress: { ...base.stress, netPnlNormal: 'invalid' as unknown as number },
      }),
    ).toThrow(ZodError);

    expect(() =>
      runPromotionGate({
        ...base,
        rogueKey: 'injected_bypass',
      } as unknown as PromotionGateInput),
    ).toThrow(ZodError);

    expect(() => runPromotionGate(base, { minTrades: -10 })).toThrow(ZodError);
    expect(() => runPromotionGate(base, { maxDrawdown: 1.5 })).toThrow(ZodError);
  });
});
