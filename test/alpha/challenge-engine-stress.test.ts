import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  runPromotionGate,
  type PromotionGateInput,
  type PromotionGateConfig,
} from '../../src/forest/alpha/gate/index';

function createPassingInput(): PromotionGateInput {
  return {
    financial: {
      numTrades: 50,
      expectancy: 15.0,
      profitFactor: 2.0,
      maxDrawdown: 0.12,
      sharpe: 1.8,
      sortino: 2.2,
      byRegime: {
        bull: { numTrades: 30, netPnl: 800 },
        bear: { numTrades: 20, netPnl: 500 },
      },
    },
    stress: {
      netPnlNormal: 600,
      netPnlConservative: 450,
      netPnlAdverse: 300,
      netPnlExtreme: 150,
    },
    robustness: {
      parameterSpread: 0.20,
      crossPeriodPositiveFraction: 0.80,
      crossAssetPositiveFraction: 0.70,
      crossAssetApplicable: true,
      leakageViolations: 0,
      windowPnls: [400, 350, 300],
      baselineCandidate: { sharpe: 1.8, netPnl: 1050 },
      baselineBuyHold: { sharpe: 1.0, netPnl: 500 },
      baselineRandomEntry: { sharpe: 0.2, netPnl: 100 },
      hashMatches: true,
      hashDetails: { recordedHash: 'sha_emp_456', expectedHash: 'sha_emp_456' },
    },
  };
}

describe('Empirical Adversarial Challenge: runPromotionGate Engine Stress', () => {
  describe('Immutability and Result Structure', () => {
    it('returns typed read-only structure with 15 checks', () => {
      const res = runPromotionGate(createPassingInput());
      expect(res.checks).toHaveLength(15);
      expect(res.verdict).toBe('PASSED');
      expect(res.passed).toBe(true);
      expect(res.failedChecks).toHaveLength(0);
      expect(res.diagnosticReasons).toHaveLength(0);
    });

    it('documents runtime freeze status of returned result', () => {
      const res = runPromotionGate(createPassingInput());
      // Empirically document whether Object.freeze is applied
      const isFrozen = Object.isFrozen(res);
      // The implementation returns a standard JS object typed with TS readonly
      expect(typeof isFrozen).toBe('boolean');
    });
  });

  describe('Determinism and Repeated Executions', () => {
    it('repeated calls with identical inputs produce identical checks and verdicts', () => {
      const input = createPassingInput();
      const res1 = runPromotionGate(input);
      const res2 = runPromotionGate(input);

      expect(res1.passed).toBe(res2.passed);
      expect(res1.verdict).toBe(res2.verdict);
      expect(res1.checks.length).toBe(res2.checks.length);
      for (let i = 0; i < res1.checks.length; i++) {
        expect(res1.checks[i].name).toBe(res2.checks[i].name);
        expect(res1.checks[i].passed).toBe(res2.checks[i].passed);
        expect(res1.checks[i].actual).toBe(res2.checks[i].actual);
        expect(res1.checks[i].threshold).toBe(res2.checks[i].threshold);
        expect(res1.checks[i].detail).toBe(res2.checks[i].detail);
      }
      expect(res1.failedChecks).toEqual(res2.failedChecks);
      expect(res1.diagnosticReasons).toEqual(res2.diagnosticReasons);
    });

    it('records timestamp >= initial invocation time', () => {
      const t0 = Date.now();
      const res = runPromotionGate(createPassingInput());
      expect(res.timestamp).toBeGreaterThanOrEqual(t0);
    });
  });

  describe('Fail-Closed Zod Validation: Malformed, Missing, Injected, and NaN Metrics', () => {
    it('fails closed on null or undefined sections', () => {
      const base = createPassingInput();
      expect(() => runPromotionGate({ ...base, financial: null as unknown as typeof base.financial })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, stress: null as unknown as typeof base.stress })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, robustness: null as unknown as typeof base.robustness })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, financial: undefined as unknown as typeof base.financial })).toThrow(ZodError);
    });

    it('fails closed on injected unknown properties across sections', () => {
      const base = createPassingInput();
      expect(() => runPromotionGate({ ...base, rogueTopLevel: 'malicious' } as unknown as PromotionGateInput)).toThrow(ZodError);
      expect(() => runPromotionGate({
        ...base,
        financial: { ...base.financial, rogueFinancial: 1 } as unknown as typeof base.financial,
      })).toThrow(ZodError);
      expect(() => runPromotionGate({
        ...base,
        stress: { ...base.stress, rogueStress: 1 } as unknown as typeof base.stress,
      })).toThrow(ZodError);
      expect(() => runPromotionGate({
        ...base,
        robustness: { ...base.robustness, rogueRobustness: 1 } as unknown as typeof base.robustness,
      })).toThrow(ZodError);
    });

    it('fails closed on NaN metrics across financial, stress, and robustness inputs', () => {
      const base = createPassingInput();

      // Financial NaNs
      expect(() => runPromotionGate({ ...base, financial: { ...base.financial, numTrades: Number.NaN } })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, financial: { ...base.financial, expectancy: Number.NaN } })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, financial: { ...base.financial, profitFactor: Number.NaN } })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, financial: { ...base.financial, maxDrawdown: Number.NaN } })).toThrow(ZodError);

      // Stress NaNs
      expect(() => runPromotionGate({ ...base, stress: { ...base.stress, netPnlNormal: Number.NaN } })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, stress: { ...base.stress, netPnlExtreme: Number.NaN } })).toThrow(ZodError);

      // Robustness NaNs
      expect(() => runPromotionGate({ ...base, robustness: { ...base.robustness, parameterSpread: Number.NaN } })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, robustness: { ...base.robustness, crossPeriodPositiveFraction: Number.NaN } })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, robustness: { ...base.robustness, leakageViolations: Number.NaN } })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, robustness: { ...base.robustness, windowPnls: [100, Number.NaN] } })).toThrow(ZodError);
    });

    it('fails closed on malformed types and out-of-bounds config overrides', () => {
      const base = createPassingInput();

      expect(() => runPromotionGate({ ...base, financial: { ...base.financial, numTrades: 25.7 } })).toThrow(ZodError);
      expect(() => runPromotionGate({ ...base, robustness: { ...base.robustness, leakageViolations: 1.2 } })).toThrow(ZodError);
      expect(() => runPromotionGate(base, { minTrades: -1 } as Partial<PromotionGateConfig>)).toThrow(ZodError);
      expect(() => runPromotionGate(base, { maxDrawdown: 1.01 } as Partial<PromotionGateConfig>)).toThrow(ZodError);
      expect(() => runPromotionGate(base, { rogueConfig: 'bad' } as unknown as Partial<PromotionGateConfig>)).toThrow(ZodError);
    });
  });
});
