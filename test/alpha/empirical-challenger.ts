/* eslint-disable no-console */
/**
 * Empirical Adversarial Test Harness for Milestone 1 Checks 9-15
 * Challenger: challenger_p9_m1_2
 */

import {
  checkParameterRobustness,
  checkCrossPeriodRobustness,
  checkCrossAssetRobustness,
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
  checkBaselineComparison,
  checkReproducibleHash,
} from '../../src/forest/alpha/gate/robustness-checks';

interface TestResult {
  name: string;
  passed: boolean;
  actual: unknown;
  expected: boolean;
  detail: string;
}

const results: TestResult[] = [];

function assertCheck(name: string, check: { passed: boolean; detail: string; actual: unknown }, expectedPassed: boolean) {
  const ok = check.passed === expectedPassed;
  results.push({
    name,
    passed: ok,
    actual: check.passed,
    expected: expectedPassed,
    detail: check.detail,
  });
  if (!ok) {
    console.error(`FAIL: ${name} — Expected passed=${expectedPassed}, got passed=${check.passed}. Detail: ${check.detail}`);
  } else {
    console.log(`PASS: ${name}`);
  }
}

console.log('=== EMPIRICAL CHALLENGE SUITE: CHECKS 9-15 ===\n');

// ----------------------------------------------------
// Check 9: parameterRobustness
// ----------------------------------------------------
console.log('--- Check 9: parameterRobustness ---');
assertCheck('Check 9: spread = 0.500 (exact threshold)', checkParameterRobustness(0.500, 0.50), true);
assertCheck('Check 9: spread = 0.501 (boundary fail)', checkParameterRobustness(0.501, 0.50), false);
assertCheck('Check 9: spread = 0.499 (boundary pass)', checkParameterRobustness(0.499, 0.50), true);
assertCheck('Check 9: spread = 0.0 (flat response)', checkParameterRobustness(0.0, 0.50), true);
assertCheck('Check 9: spread = 0.85 (parameter cliff)', checkParameterRobustness(0.85, 0.50), false);
assertCheck('Check 9: spread = 1.0 (extreme cliff)', checkParameterRobustness(1.0, 0.50), false);
assertCheck('Check 9: spread = -0.001 (negative spread fail-closed)', checkParameterRobustness(-0.001, 0.50), false);
assertCheck('Check 9: spread = NaN (fail-closed)', checkParameterRobustness(Number.NaN, 0.50), false);
assertCheck('Check 9: spread = Infinity (fail-closed)', checkParameterRobustness(Infinity, 0.50), false);
assertCheck('Check 9: spread = -Infinity (fail-closed)', checkParameterRobustness(-Infinity, 0.50), false);
assertCheck('Check 9: custom threshold 0.30 with spread 0.30', checkParameterRobustness(0.30, 0.30), true);
assertCheck('Check 9: custom threshold 0.30 with spread 0.31', checkParameterRobustness(0.31, 0.30), false);

// ----------------------------------------------------
// Check 10: crossPeriodRobustness
// ----------------------------------------------------
console.log('\n--- Check 10: crossPeriodRobustness ---');
assertCheck('Check 10: 60.0% (0.600 exact threshold)', checkCrossPeriodRobustness(0.600, 0.60), true);
assertCheck('Check 10: 59.9% (0.599 boundary fail)', checkCrossPeriodRobustness(0.599, 0.60), false);
assertCheck('Check 10: 60.1% (0.601 boundary pass)', checkCrossPeriodRobustness(0.601, 0.60), true);
assertCheck('Check 10: 3/5 windows positive (60.0%)', checkCrossPeriodRobustness(3 / 5, 0.60), true);
assertCheck('Check 10: 2/5 windows positive (40.0%)', checkCrossPeriodRobustness(2 / 5, 0.60), false);
assertCheck('Check 10: 0 windows (0/0 = NaN fail-closed)', checkCrossPeriodRobustness(Number.NaN, 0.60), false);
assertCheck('Check 10: 0.0 (0% positive windows)', checkCrossPeriodRobustness(0.0, 0.60), false);
assertCheck('Check 10: 1.001 (> 100% invalid fail-closed)', checkCrossPeriodRobustness(1.001, 0.60), false);
assertCheck('Check 10: -0.1 (negative fraction fail-closed)', checkCrossPeriodRobustness(-0.1, 0.60), false);
assertCheck('Check 10: Infinity (fail-closed)', checkCrossPeriodRobustness(Infinity, 0.60), false);

// ----------------------------------------------------
// Check 11: crossAssetRobustness
// ----------------------------------------------------
console.log('\n--- Check 11: crossAssetRobustness ---');
assertCheck('Check 11: 50.0% (0.500 exact threshold)', checkCrossAssetRobustness(0.500, true, 0.50), true);
assertCheck('Check 11: 49.9% (0.499 boundary fail)', checkCrossAssetRobustness(0.499, true, 0.50), false);
assertCheck('Check 11: 50.1% (0.501 boundary pass)', checkCrossAssetRobustness(0.501, true, 0.50), true);
assertCheck('Check 11: 2/4 assets positive (50.0%)', checkCrossAssetRobustness(2 / 4, true, 0.50), true);
assertCheck('Check 11: 1/4 assets positive (25.0%)', checkCrossAssetRobustness(1 / 4, true, 0.50), false);
assertCheck('Check 11: applicable=false exemption with null', checkCrossAssetRobustness(null, false, 0.50), true);
assertCheck('Check 11: applicable=false exemption with undefined', checkCrossAssetRobustness(undefined, false, 0.50), true);
assertCheck('Check 11: applicable=false exemption with 0.0', checkCrossAssetRobustness(0.0, false, 0.50), true);
assertCheck('Check 11: applicable=true with null (fail-closed)', checkCrossAssetRobustness(null, true, 0.50), false);
assertCheck('Check 11: applicable=true with undefined (fail-closed)', checkCrossAssetRobustness(undefined, true, 0.50), false);
assertCheck('Check 11: applicable=true with NaN (fail-closed)', checkCrossAssetRobustness(Number.NaN, true, 0.50), false);
assertCheck('Check 11: applicable=true with > 1.0 (fail-closed)', checkCrossAssetRobustness(1.05, true, 0.50), false);
assertCheck('Check 11: applicable=true with negative (fail-closed)', checkCrossAssetRobustness(-0.1, true, 0.50), false);

// ----------------------------------------------------
// Check 12: leakageInvariance
// ----------------------------------------------------
console.log('\n--- Check 12: leakageInvariance ---');
assertCheck('Check 12: exactly 0 mutations (clean)', checkLeakageInvariance(0), true);
assertCheck('Check 12: exactly 1 mutation (fatal)', checkLeakageInvariance(1), false);
assertCheck('Check 12: 5 mutations (fatal)', checkLeakageInvariance(5), false);
assertCheck('Check 12: -1 mutations (invalid fail-closed)', checkLeakageInvariance(-1), false);
assertCheck('Check 12: 0.5 mutations (fractional fail-closed)', checkLeakageInvariance(0.5), false);
assertCheck('Check 12: NaN mutations (fail-closed)', checkLeakageInvariance(Number.NaN), false);
assertCheck('Check 12: Infinity mutations (fail-closed)', checkLeakageInvariance(Infinity), false);

// ----------------------------------------------------
// Check 13: noSingleWindowDependency
// ----------------------------------------------------
console.log('\n--- Check 13: noSingleWindowDependency ---');
assertCheck('Check 13: W=1 with profit 1000 must fail 100%', checkNoSingleWindowDependency([1000], 0.50), false);
assertCheck('Check 13: W=1 with loss -500 must fail 100%', checkNoSingleWindowDependency([-500], 0.50), false);
assertCheck('Check 13: W=1 with 0 must fail 100%', checkNoSingleWindowDependency([0], 0.50), false);
assertCheck('Check 13: 50.0% contribution [500, 500] (boundary pass)', checkNoSingleWindowDependency([500, 500], 0.50), true);
assertCheck('Check 13: 50.1% contribution [501, 499] (boundary fail)', checkNoSingleWindowDependency([501, 499], 0.50), false);
assertCheck('Check 13: 49.9% contribution [499, 251, 250] (boundary pass)', checkNoSingleWindowDependency([499, 251, 250], 0.50), true);
assertCheck('Check 13: negative total PnL [-100, -200] (fail-closed)', checkNoSingleWindowDependency([-100, -200], 0.50), false);
assertCheck('Check 13: negative total PnL [100, -200] (fail-closed)', checkNoSingleWindowDependency([100, -200], 0.50), false);
assertCheck('Check 13: zero total PnL [0, 0] (fail-closed)', checkNoSingleWindowDependency([0, 0], 0.50), false);
assertCheck('Check 13: empty windows [] (fail-closed)', checkNoSingleWindowDependency([], 0.50), false);
assertCheck('Check 13: non-finite element [100, NaN] (fail-closed)', checkNoSingleWindowDependency([100, Number.NaN], 0.50), false);
assertCheck('Check 13: non-finite element [100, Infinity] (fail-closed)', checkNoSingleWindowDependency([100, Infinity], 0.50), false);
assertCheck('Check 13: positive total with negative window [120, -20] (120% contribution fail)', checkNoSingleWindowDependency([120, -20], 0.50), false);

// ----------------------------------------------------
// Check 14: baselineComparison
// ----------------------------------------------------
console.log('\n--- Check 14: baselineComparison ---');
const cand = { sharpe: 1.5, netPnl: 2000 };
const bhPass = { sharpe: 1.0, netPnl: 1000 };
const rePass = { sharpe: 0.2, netPnl: 100 };

assertCheck('Check 14: candidate beats both on Sharpe and PnL', checkBaselineComparison(cand, bhPass, rePass), true);
assertCheck('Check 14: beats Random but lags Buy & Hold Sharpe', checkBaselineComparison(cand, { sharpe: 1.6, netPnl: 1000 }, rePass), false);
assertCheck('Check 14: beats Random but lags Buy & Hold PnL', checkBaselineComparison(cand, { sharpe: 1.0, netPnl: 2500 }, rePass), false);
assertCheck('Check 14: beats PnL but lags Sharpe (BH)', checkBaselineComparison(cand, { sharpe: 1.55, netPnl: 1500 }, rePass), false);
assertCheck('Check 14: ties Buy & Hold Sharpe exactly (strict >)', checkBaselineComparison(cand, { sharpe: 1.5, netPnl: 1000 }, rePass), false);
assertCheck('Check 14: ties Buy & Hold PnL exactly (strict >)', checkBaselineComparison(cand, { sharpe: 1.0, netPnl: 2000 }, rePass), false);
assertCheck('Check 14: ties Random Sharpe exactly (strict >)', checkBaselineComparison(cand, bhPass, { sharpe: 1.5, netPnl: 100 }), false);
assertCheck('Check 14: ties Random PnL exactly (strict >)', checkBaselineComparison(cand, bhPass, { sharpe: 0.2, netPnl: 2000 }), false);
assertCheck('Check 14: marginal beat 0.0001 over both', checkBaselineComparison(
  { sharpe: 1.0001, netPnl: 1000.01 },
  { sharpe: 1.0000, netPnl: 1000.00 },
  { sharpe: 0.5000, netPnl: 500.00 },
), true);
assertCheck('Check 14: null benchmark Sharpes with positive candidate Sharpe', checkBaselineComparison(
  { sharpe: 1.0, netPnl: 1000 },
  { sharpe: null, netPnl: 500 },
  { sharpe: null, netPnl: 200 },
), true);
assertCheck('Check 14: invalid candidate Sharpe NaN (fail-closed)', checkBaselineComparison(
  { sharpe: Number.NaN, netPnl: 1000 },
  bhPass,
  rePass,
), false);
assertCheck('Check 14: invalid candidate PnL NaN (fail-closed)', checkBaselineComparison(
  { sharpe: 1.5, netPnl: Number.NaN },
  bhPass,
  rePass,
), false);
assertCheck('Check 14: invalid BH PnL NaN (fail-closed)', checkBaselineComparison(
  cand,
  { sharpe: 1.0, netPnl: Number.NaN },
  rePass,
), false);

// ----------------------------------------------------
// Check 15: reproducibleHash
// ----------------------------------------------------
console.log('\n--- Check 15: reproducibleHash ---');
assertCheck('Check 15: hashMatches = true with object details', checkReproducibleHash(true, { recordedHash: 'abc', expectedHash: 'abc' }), true);
assertCheck('Check 15: hashMatches = false with object details', checkReproducibleHash(false, { recordedHash: 'abc', expectedHash: 'xyz' }), false);
assertCheck('Check 15: hashMatches = true with string detail', checkReproducibleHash(true, 'Canonical hash match'), true);
assertCheck('Check 15: hashMatches = false with string detail', checkReproducibleHash(false, 'Mismatch'), false);
assertCheck('Check 15: hashMatches = true without details', checkReproducibleHash(true), true);
assertCheck('Check 15: hashMatches = false without details', checkReproducibleHash(false), false);

// Strict boolean check on checkReproducibleHash:
assertCheck('Check 15: truthy number 1 fails strict boolean equality', checkReproducibleHash(1 as unknown as boolean), false);
assertCheck('Check 15: truthy string "true" fails strict boolean equality', checkReproducibleHash('true' as unknown as boolean), false);
assertCheck('Check 15: null fails strict boolean equality', checkReproducibleHash(null as unknown as boolean), false);
assertCheck('Check 15: undefined fails strict boolean equality', checkReproducibleHash(undefined as unknown as boolean), false);

// Cryptographic Provenance Pipeline Empirical Verification
console.log('\n--- Check 15: Cryptographic Pipeline (SHA-256 & Canonical JSON) ---');
import { createHash } from 'node:crypto';
import { canonicalize } from '../../src/lib/canonical-json';

function verifyExperimentHash(
  recordedHash: string | undefined,
  gitSha: string | undefined,
  seed: number | null | undefined,
  config: unknown,
): { matches: boolean; computed: string; reason?: string } {
  if (!gitSha || gitSha.trim().length === 0) {
    return { matches: false, computed: '', reason: 'Missing git commit SHA' };
  }
  if (!recordedHash || recordedHash.trim().length === 0) {
    return { matches: false, computed: '', reason: 'Missing recorded hash' };
  }
  const payload = { gitSha: gitSha.trim(), seed: seed ?? 0, config: config ?? {} };
  const canonical = canonicalize(payload);
  const computed = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const normalizedRecorded = recordedHash.trim().toLowerCase();
  const matches = normalizedRecorded === computed.toLowerCase();
  return { matches, computed };
}

const baseGitSha = '0123456789abcdef0123456789abcdef01234567';
const baseSeed = 42;
const baseConfig = { alpha: 'momentum-v1', params: { lookback: 20, threshold: 0.05 } };
const { computed: expectedHash } = verifyExperimentHash('dummy', baseGitSha, baseSeed, baseConfig);

// Test 1: Exact match
const exactResult = verifyExperimentHash(expectedHash, baseGitSha, baseSeed, baseConfig);
assertCheck('Crypto Hash: Exact 64-char match', checkReproducibleHash(exactResult.matches, { recordedHash: expectedHash, expectedHash }), true);

// Test 2: 1-char difference fails
const oneCharAltered = (expectedHash.startsWith('a') ? 'b' : 'a') + expectedHash.slice(1);
const alteredResult = verifyExperimentHash(oneCharAltered, baseGitSha, baseSeed, baseConfig);
assertCheck('Crypto Hash: 1-char difference strictly fails', checkReproducibleHash(alteredResult.matches, { recordedHash: oneCharAltered, expectedHash }), false);

// Test 3: Casing normalization (uppercase matches lowercase)
const upperHash = expectedHash.toUpperCase();
const upperResult = verifyExperimentHash(upperHash, baseGitSha, baseSeed, baseConfig);
assertCheck('Crypto Hash: Casing normalization (uppercase matches)', checkReproducibleHash(upperResult.matches, { recordedHash: upperHash, expectedHash }), true);

// Test 4: Whitespace normalization (leading/trailing whitespace trimmed)
const paddedHash = `  ${expectedHash}  \n`;
const paddedResult = verifyExperimentHash(paddedHash, baseGitSha, baseSeed, baseConfig);
assertCheck('Crypto Hash: Whitespace normalization (trimmed matches)', checkReproducibleHash(paddedResult.matches, { recordedHash: paddedHash, expectedHash }), true);

// Test 5: Config key order invariance
const reorderedConfig = { params: { threshold: 0.05, lookback: 20 }, alpha: 'momentum-v1' };
const reorderedResult = verifyExperimentHash(expectedHash, baseGitSha, baseSeed, reorderedConfig);
assertCheck('Crypto Hash: Config key order invariance (canonicalize stable)', checkReproducibleHash(reorderedResult.matches, { recordedHash: expectedHash, expectedHash }), true);

// Test 6: Whitespace-only gitSha fails
const whitespaceGitShaResult = verifyExperimentHash(expectedHash, '   ', baseSeed, baseConfig);
assertCheck('Crypto Hash: Whitespace-only gitSha fails', checkReproducibleHash(whitespaceGitShaResult.matches), false);

// Test 7: Post-hoc config mutation fails
const mutatedConfig = { ...baseConfig, params: { ...baseConfig.params, lookback: 21 } };
const mutatedResult = verifyExperimentHash(expectedHash, baseGitSha, baseSeed, mutatedConfig);
assertCheck('Crypto Hash: Altered config parameter strictly fails', checkReproducibleHash(mutatedResult.matches), false);


const passedCount = results.filter((r) => r.passed).length;
const totalCount = results.length;
console.log(`\n==============================================`);
console.log(`TOTAL EMPIRICAL TESTS: ${totalCount}`);
console.log(`PASSED: ${passedCount}`);
console.log(`FAILED: ${totalCount - passedCount}`);
console.log(`==============================================`);

if (passedCount !== totalCount) {
  process.exit(1);
}
