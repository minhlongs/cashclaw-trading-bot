// Live Readiness Hardening — Report Generator
// Runs all checks and produces an aggregated ReadinessReport.

import type { ReadinessCheck, ReadinessReport, OverallStatus } from './types';
import {
  checkTypeScriptCompilation,
  checkTestCoverage,
  checkNoAnyTypes,
  checkNoEslintDisables,
  checkBuildPasses,
  checkSecretsNotCommitted,
  checkPaperTradingOnly,
  checkCostModelConfigured,
  checkRegimeEngineWired,
  checkWalkForwardWired,
} from './checks';

// ── Status computation ────────────────────────────────────────────────────────

/** Overall = FAIL if any failure, WARN if only warnings, PASS otherwise. */
export function computeOverallStatus(checks: ReadinessCheck[]): OverallStatus {
  const hasFail = checks.some(c => c.status === 'fail');
  if (hasFail) return 'fail';
  const hasWarn = checks.some(c => c.status === 'warn');
  if (hasWarn) return 'warn';
  return 'pass';
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Run every registered readiness check and return an aggregated report. */
export function generateReadinessReport(): ReadinessReport {
  const checks: ReadinessCheck[] = [
    checkTypeScriptCompilation(),
    checkTestCoverage(),
    checkNoAnyTypes(),
    checkNoEslintDisables(),
    checkBuildPasses(),
    checkSecretsNotCommitted(),
    checkPaperTradingOnly(),
    checkCostModelConfigured(),
    checkRegimeEngineWired(),
    checkWalkForwardWired(),
  ];

  const passedChecks = checks.filter(c => c.status === 'pass').length;
  const failedChecks = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warn').length;

  return {
    timestamp: new Date().toISOString(),
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    warnings,
    checks,
    overallStatus: computeOverallStatus(checks),
  };
}
