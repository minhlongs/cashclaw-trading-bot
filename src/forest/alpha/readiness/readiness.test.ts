// Live Readiness Hardening — Tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReadinessCheck } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCheck(
  name: string,
  status: ReadinessCheck['status'],
  category: ReadinessCheck['category'] = 'ci_cd',
): ReadinessCheck {
  return { name, category, status, description: `Mock ${name}` };
}

// ── Mock checks module ────────────────────────────────────────────────────────

const MOCK_CHECKS: ReadinessCheck[] = [
  makeCheck('typescript_compilation', 'pass'),
  makeCheck('test_coverage', 'pass'),
  makeCheck('no_any_types', 'pass'),
  makeCheck('no_eslint_disables', 'warn'),
  makeCheck('build_passes', 'pass'),
  makeCheck('secrets_not_committed', 'pass'),
  makeCheck('paper_trading_only', 'pass'),
  makeCheck('cost_model_configured', 'pass'),
  makeCheck('regime_engine_wired', 'pass'),
  makeCheck('walk_forward_wired', 'fail'),
];

vi.mock('./checks', () => ({
  checkTypeScriptCompilation: () => MOCK_CHECKS[0],
  checkTestCoverage: () => MOCK_CHECKS[1],
  checkNoAnyTypes: () => MOCK_CHECKS[2],
  checkNoEslintDisables: () => MOCK_CHECKS[3],
  checkBuildPasses: () => MOCK_CHECKS[4],
  checkSecretsNotCommitted: () => MOCK_CHECKS[5],
  checkPaperTradingOnly: () => MOCK_CHECKS[6],
  checkCostModelConfigured: () => MOCK_CHECKS[7],
  checkRegimeEngineWired: () => MOCK_CHECKS[8],
  checkWalkForwardWired: () => MOCK_CHECKS[9],
}));

// ── Import after mock ─────────────────────────────────────────────────────────

import { computeOverallStatus, generateReadinessReport } from './reporter';

// ── Tests: computeOverallStatus ───────────────────────────────────────────────

describe('computeOverallStatus', () => {
  it('returns pass when all checks pass', () => {
    const checks: ReadinessCheck[] = [
      makeCheck('a', 'pass'), makeCheck('b', 'pass'),
    ];
    expect(computeOverallStatus(checks)).toBe('pass');
  });

  it('returns warn when only warnings exist', () => {
    const checks: ReadinessCheck[] = [
      makeCheck('a', 'pass'), makeCheck('b', 'warn'),
    ];
    expect(computeOverallStatus(checks)).toBe('warn');
  });

  it('returns fail when any check fails', () => {
    const checks: ReadinessCheck[] = [
      makeCheck('a', 'pass'), makeCheck('b', 'warn'), makeCheck('c', 'fail'),
    ];
    expect(computeOverallStatus(checks)).toBe('fail');
  });

  it('returns pass for empty check list', () => {
    expect(computeOverallStatus([])).toBe('pass');
  });
});

// ── Tests: generateReadinessReport ────────────────────────────────────────────

describe('generateReadinessReport', () => {
  it('returns a well-formed report with correct counts', () => {
    const report = generateReadinessReport();

    expect(report.timestamp).toBeTruthy();
    expect(report.totalChecks).toBe(10);
    expect(report.passedChecks).toBe(8);
    expect(report.warnings).toBe(1);
    expect(report.failedChecks).toBe(1);
    expect(report.checks.length).toBe(10);
    expect(report.overallStatus).toBe('fail');
  });

  it('each check has required fields', () => {
    const report = generateReadinessReport();
    for (const check of report.checks) {
      expect(check.name).toBeTruthy();
      expect(check.description).toBeTruthy();
      expect(['pass', 'fail', 'warn']).toContain(check.status);
      expect(check.category).toBeTruthy();
    }
  });

  it('computes overall status correctly via computeOverallStatus', () => {
    const allWarn: ReadinessCheck[] = MOCK_CHECKS.map(c => ({
      ...c, status: 'warn' as const,
    }));
    expect(computeOverallStatus(allWarn)).toBe('warn');
  });
});
