import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  runPromotionGate,
  checkMinRegimeCoverage,
  checkReproducibleHash,
  GateCheckNameSchema,
  GateCheckSchema,
  PromotionGateConfigSchema,
  PromotionGateResultSchema,
  type PromotionGateInput,
} from '../../src/forest/alpha/gate/index';
import {
  transitionStrategy,
  getTransition,
  isTerminalPhase,
  gateResultToTrigger,
  type StrategyPhase,
  type GateResultInput,
} from '../../src/forest/alpha/gate/promotion-states';
import { runSurvivalGate } from '../../src/forest/alpha/gate/survival-gate';
import { RegimeLabel } from '../../src/tree/regime/types';
import type { EvaluationReport } from '../../src/forest/alpha/evaluation/report';

function makePassingCandidate(overrides: Partial<PromotionGateInput> = {}): PromotionGateInput {
  return {
    financial: {
      numTrades: 45, expectancy: 1.2, profitFactor: 1.6, maxDrawdown: 0.12,
      sharpe: 1.4, sortino: 1.8,
      byRegime: { bull: { numTrades: 25, netPnl: 300 }, bear: { numTrades: 20, netPnl: 200 } },
    },
    stress: { netPnlNormal: 250, netPnlConservative: 180, netPnlAdverse: 120, netPnlExtreme: 50 },
    robustness: {
      parameterSpread: 0.18, crossPeriodPositiveFraction: 0.85, crossAssetPositiveFraction: 0.75,
      crossAssetApplicable: true, leakageViolations: 0, windowPnls: [80, 70, 50],
      baselineCandidate: { sharpe: 1.4, netPnl: 200 },
      baselineBuyHold: { sharpe: 0.6, netPnl: 80 },
      baselineRandomEntry: { sharpe: 0.1, netPnl: 20 },
      hashMatches: true, hashDetails: { recordedHash: 'h_pass_01', expectedHash: 'h_pass_01' },
    },
    ...overrides,
  };
}

function makeSurvivalReport(byRegime: Partial<Record<RegimeLabel, Partial<EvaluationReport>>>): EvaluationReport {
  return {
    experimentId: 'adv-01', symbol: 'ETH/USDT', timeframe: '1h', regime: RegimeLabel.TREND_UP,
    totalReturn: 0.25, netPnl: 500, cagr: 0.2, winRate: 0.6, lossRate: 0.4, profitFactor: 1.6,
    expectancy: 1.2, sharpe: 1.5, sortino: 1.9, maxDrawdown: 0.1, avgTrade: 12, medianTrade: 10,
    numTrades: 45, turnover: 120, fees: 30, slippage: 15, exposure: 0.6, recoveryFactor: 3.5,
    byRegime: byRegime as EvaluationReport['byRegime'], byMonth: {}, byVolBucket: {}, byDuration: { short: {}, medium: {}, long: {} },
  };
}

describe('Tier 5 Adversarial Hardening: Gate Schemas & Strict Validation', () => {
  it('enforces enum bounds and strict schema validation across all gate contracts', () => {
    expect(GateCheckNameSchema.safeParse('min_trades').success).toBe(true);
    expect(GateCheckNameSchema.safeParse('invalid_check_name').success).toBe(false);

    const validCheck = {
      name: 'min_trades' as const, passed: true, actual: 45, threshold: 30, detail: '45 trades vs min 30',
    };
    expect(GateCheckSchema.parse(validCheck)).toEqual(validCheck);
    expect(() => GateCheckSchema.parse({ ...validCheck, injectedField: 'malicious' })).toThrow(ZodError);
    expect(() => PromotionGateConfigSchema.parse({ minTrades: 0 })).toThrow(ZodError);
    expect(() => PromotionGateConfigSchema.parse({ maxDrawdown: -0.05 })).toThrow(ZodError);
    expect(() => PromotionGateConfigSchema.parse({ minProfitFactor: -1 })).toThrow(ZodError);
    expect(() => PromotionGateResultSchema.parse({
      passed: true, verdict: 'INVALID_VERDICT', checks: [], failedChecks: [], diagnosticReasons: [], timestamp: 1,
    })).toThrow(ZodError);
  });

  it('runs promotion gate with undefined config fallback and empty config overrides', () => {
    const candidate = makePassingCandidate();
    const resDefault = runPromotionGate(candidate);
    expect(resDefault.passed).toBe(true);
    expect(resDefault.verdict).toBe('PASSED');

    const resEmptyConfig = runPromotionGate(candidate, {});
    expect(resEmptyConfig.passed).toBe(true);
    expect(resEmptyConfig.checks).toHaveLength(15);
  });
});

describe('Tier 5 Adversarial Hardening: Diagnostics & Uncovered Fallback Branches', () => {
  it('handles regimes with undefined numTrades or netPnl in checkMinRegimeCoverage', () => {
    const unexperienced = checkMinRegimeCoverage({ bull: {} });
    expect(unexperienced.passed).toBe(false);
    expect(unexperienced.actual).toBe(0);

    const unprovidedNetPnl = checkMinRegimeCoverage({
      bull: { numTrades: 10 },
      bear: { numTrades: 10, netPnl: 100 },
    });
    expect(unprovidedNetPnl.passed).toBe(true);
    expect(unprovidedNetPnl.actual).toBe(0.5);
  });

  it('exercises all hashDetails object and string fallback branches in checkReproducibleHash', () => {
    const verifiedDefault = checkReproducibleHash(true, {});
    expect(verifiedDefault.detail).toBe('Canonical experiment hash verified: match');

    const mismatchUnknown = checkReproducibleHash(false, {});
    expect(mismatchUnknown.detail).toBe('Mismatch: recorded unknown vs computed unknown');

    const stringDetail = checkReproducibleHash(true, 'direct custom detail string');
    expect(stringDetail.detail).toBe('direct custom detail string');

    const passNoDetails = checkReproducibleHash(true);
    expect(passNoDetails.detail).toBe('Canonical experiment hash verified');

    const failNoDetails = checkReproducibleHash(false);
    expect(failNoDetails.detail).toBe('Canonical experiment hash mismatch');
  });

  it('covers survival gate regimes with undefined numTrades fallback', () => {
    const report = makeSurvivalReport({ [RegimeLabel.TREND_UP]: {} });
    expect(runSurvivalGate(report).status).toBe('KILLED');
  });
});

describe('Tier 5 Adversarial Hardening: State Machine Edge Invariants', () => {
  it('formats manual_approval boolean diagnostics upon invalid state transition', () => {
    expect(() => transitionStrategy('RESEARCH', { type: 'manual_approval', approved: true }))
      .toThrow(/manual_approval\(true\)/);
    expect(() => transitionStrategy('BACKTEST', { type: 'manual_approval', approved: false }))
      .toThrow(/manual_approval\(false\)/);
    expect(getTransition('SHADOW', { type: 'manual_approval', approved: false })).toBe('KILLED');
  });

  it('maps all polymorphic string and object inputs safely in gateResultToTrigger', () => {
    expect(gateResultToTrigger('PAPER_CANDIDATE')).toEqual({ type: 'gate_passed' });
    expect(gateResultToTrigger('KILLED')).toEqual({ type: 'gate_failed' });
    expect(gateResultToTrigger('UNKNOWN_STRING' as unknown as GateResultInput)).toEqual({ type: 'gate_failed' });
    expect(gateResultToTrigger({ verdict: 'KILLED' })).toEqual({ type: 'gate_failed' });
    expect(gateResultToTrigger({ status: 'PAPER_CANDIDATE' })).toEqual({ type: 'gate_passed' });
    expect(gateResultToTrigger({ status: 'KILLED' })).toEqual({ type: 'gate_failed' });
    expect(gateResultToTrigger({ status: 'UNKNOWN' as unknown as 'PASSED' })).toEqual({ type: 'gate_failed' });
  });

  it('strictly identifies terminal phases', () => {
    const nonTerminals: StrategyPhase[] = [
      'RESEARCH', 'BACKTEST', 'OOS_PASS', 'ROBUSTNESS_PASS', 'PAPER', 'SHADOW', 'MANUAL_APPROVAL',
    ];
    for (const phase of nonTerminals) {
      expect(isTerminalPhase(phase)).toBe(false);
    }
    expect(isTerminalPhase('LIVE')).toBe(true);
    expect(isTerminalPhase('KILLED')).toBe(true);
  });
});
