// Committed-artifact consistency test for the multi-pair composition walk-forward sweep.
// Re-reading the committed JSON and asserting schema, invariants, and key findings so that
// regressions in the composition/pipeline/survival-gate layers are caught before commit.
//
// Byte-identical determinism is not pinnable here: the sweep script injects
// `new Date().toISOString()` and requires filesystem OHLCV cache that is absent in CI.
// The schema + content invariants below provide equivalent regression protection.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ARTIFACT_PATH = join(process.cwd(), 'plans/reports/multi-pair-composition-sweep-report.json');

type SurvivalCheck = {
  name: string;
  passed: boolean;
  actual: number;
  threshold: number;
  detail: string;
};

type SweepReport = {
  timestamp: string;
  universe: string[];
  scanResult: {
    candidatePairsCount: number;
    diversifiedPairsCount: number;
    signalsCount: number;
    diversifiedPairs: string[];
  };
  pairCorrelations: Record<string, { avgCorr: number; points: number }>;
  compositionWalkForward: {
    windowsCount: number;
    summaryStats: {
      totalWindows: number;
      avgInSampleSharpe: number;
      avgOutSampleSharpe: number;
      degradationRatio: number;
      positiveOosFraction: number;
    };
    stitchedSharpe: number;
    stitchedMaxDrawdownPct: number;
  };
  pipelineSummary: {
    totalSteps: number;
    passedSteps: number;
    finalSharpe: number;
    recommendation: string;
    survivalGate: {
      status: string;
      reason: string;
      checks: SurvivalCheck[];
    };
    promotion: {
      from: string;
      to: string;
      trigger: { type: string };
    };
  };
};

function loadCommitted(): SweepReport {
  return JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as SweepReport;
}

describe('committed artifact: multi-pair composition walk-forward sweep', () => {
  it('parses to a valid object with all expected top-level keys', () => {
    const r = loadCommitted();
    expect(typeof r.timestamp).toBe('string');
    expect(Array.isArray(r.universe)).toBe(true);
    expect(r.scanResult).toBeDefined();
    expect(r.pairCorrelations).toBeDefined();
    expect(r.compositionWalkForward).toBeDefined();
    expect(r.pipelineSummary).toBeDefined();
  });

  it('universe is exactly [BTCUSDT, ETHUSDT, SOLUSDT]', () => {
    const { universe } = loadCommitted();
    expect(universe).toStrictEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  });

  it('scan found 0 candidate pairs (highly correlated crypto universe, no cointegration gate passed)', () => {
    const { scanResult } = loadCommitted();
    expect(scanResult.candidatePairsCount).toBe(0);
    expect(scanResult.diversifiedPairsCount).toBe(0);
    expect(scanResult.signalsCount).toBe(0);
    expect(scanResult.diversifiedPairs).toHaveLength(0);
  });

  it('pairCorrelations has 3 entries covering all universe pairs', () => {
    const { pairCorrelations } = loadCommitted();
    const pairs = Object.keys(pairCorrelations);
    expect(pairs).toHaveLength(3);
    expect(pairs).toContain('BTCUSDT/ETHUSDT');
    expect(pairs).toContain('BTCUSDT/SOLUSDT');
    expect(pairs).toContain('ETHUSDT/SOLUSDT');
  });

  it('all computed pair correlations are positive (crypto universe co-moves)', () => {
    const { pairCorrelations } = loadCommitted();
    for (const [key, entry] of Object.entries(pairCorrelations)) {
      expect(entry.avgCorr).toBeGreaterThan(0);
      expect(entry.avgCorr).toBeLessThanOrEqual(1);
      expect(entry.points).toBeGreaterThan(0);
      expect(Number.isFinite(entry.avgCorr)).toBe(true);
      expect(key).toMatch(/^[A-Z]+\/[A-Z]+$/);
    }
  });

  it('BTC/ETH correlation is the highest of the three pairs', () => {
    const { pairCorrelations } = loadCommitted();
    const btcEth = pairCorrelations['BTCUSDT/ETHUSDT']!.avgCorr;
    const btcSol = pairCorrelations['BTCUSDT/SOLUSDT']!.avgCorr;
    const ethSol = pairCorrelations['ETHUSDT/SOLUSDT']!.avgCorr;
    expect(btcEth).toBeGreaterThan(btcSol);
    expect(btcEth).toBeGreaterThan(ethSol);
  });

  it('walk-forward evaluated exactly 16 windows on 730-bar universe', () => {
    const { compositionWalkForward: wf } = loadCommitted();
    expect(wf.windowsCount).toBe(16);
    expect(wf.summaryStats.totalWindows).toBe(16);
  });

  it('walk-forward summary stats are finite numbers', () => {
    const { compositionWalkForward: { summaryStats: s } } = loadCommitted();
    expect(Number.isFinite(s.avgInSampleSharpe)).toBe(true);
    expect(Number.isFinite(s.avgOutSampleSharpe)).toBe(true);
    expect(Number.isFinite(s.degradationRatio)).toBe(true);
    expect(s.positiveOosFraction).toBeGreaterThanOrEqual(0);
    expect(s.positiveOosFraction).toBeLessThanOrEqual(1);
  });

  it('OOS window positive fraction is below 50% (degradation observed)', () => {
    const { compositionWalkForward: { summaryStats: s } } = loadCommitted();
    // 31.25% positive OOS fraction — documented sweep finding.
    expect(s.positiveOosFraction).toBeLessThan(0.5);
  });

  it('pipeline ran all 12 steps and all passed', () => {
    const { pipelineSummary: p } = loadCommitted();
    expect(p.totalSteps).toBe(12);
    expect(p.passedSteps).toBe(12);
  });

  it('survival gate status is KILLED', () => {
    const { pipelineSummary: { survivalGate: sg } } = loadCommitted();
    expect(sg.status).toBe('KILLED');
  });

  it('survival gate has exactly 8 checks', () => {
    const { pipelineSummary: { survivalGate: sg } } = loadCommitted();
    expect(sg.checks).toHaveLength(8);
  });

  it('survival gate failed on exactly 4 checks (economic criteria)', () => {
    const { pipelineSummary: { survivalGate: sg } } = loadCommitted();
    const failed = sg.checks.filter((c) => !c.passed);
    expect(failed).toHaveLength(4);
    const failedNames = new Set(failed.map((c) => c.name));
    expect(failedNames).toContain('min_expectancy');
    expect(failedNames).toContain('min_profit_factor');
    expect(failedNames).toContain('min_net_pnl_after_fees');
    expect(failedNames).toContain('min_net_pnl_adverse');
  });

  it('survival gate passed on exactly 4 checks (structural criteria)', () => {
    const { pipelineSummary: { survivalGate: sg } } = loadCommitted();
    const passed = sg.checks.filter((c) => c.passed);
    expect(passed).toHaveLength(4);
    const passedNames = new Set(passed.map((c) => c.name));
    expect(passedNames).toContain('min_trades');
    expect(passedNames).toContain('max_drawdown');
    expect(passedNames).toContain('min_sharpe');
    expect(passedNames).toContain('min_regime_coverage');
  });

  it('all check actual values are finite numbers', () => {
    const { pipelineSummary: { survivalGate: sg } } = loadCommitted();
    for (const check of sg.checks) {
      expect(Number.isFinite(check.actual)).toBe(true);
      expect(Number.isFinite(check.threshold)).toBe(true);
      expect(typeof check.name).toBe('string');
      expect(typeof check.detail).toBe('string');
    }
  });

  it('promotion path is RESEARCH → KILLED via gate_failed trigger', () => {
    const { pipelineSummary: { promotion } } = loadCommitted();
    expect(promotion.from).toBe('RESEARCH');
    expect(promotion.to).toBe('KILLED');
    expect(promotion.trigger.type).toBe('gate_failed');
  });
});
