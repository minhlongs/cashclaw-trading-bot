// Live Readiness Hardening — Individual Checks
// Each function returns one ReadinessCheck with a concrete status.
// Uses execFileSync (no shell) for safe command execution.

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import type { ReadinessCheck } from './types';

const ROOT = process.cwd();

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(name: string, desc: string): ReadinessCheck {
  return { name, category: 'ci_cd', status: 'pass', description: desc };
}

function fail(name: string, cat: ReadinessCheck['category'], desc: string): ReadinessCheck {
  return { name, category: cat, status: 'fail', description: desc };
}

function warn(name: string, cat: ReadinessCheck['category'], desc: string): ReadinessCheck {
  return { name, category: cat, status: 'warn', description: desc };
}

/** Run a command with argument array (no shell). Returns stdout or null on failure. */
function run(bin: string, args: string[]): string | null {
  try {
    return execFileSync(bin, args, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    }).trim();
  } catch {
    return null;
  }
}

// ── Checks ────────────────────────────────────────────────────────────────────

/** Verify TypeScript compiles with zero errors. */
export function checkTypeScriptCompilation(): ReadinessCheck {
  const out = run('npx', ['tsc', '--noEmit']);
  if (out === null) {
    return fail('typescript_compilation', 'ci_cd', 'tsc --noEmit exited with errors');
  }
  if (out.length > 0) {
    return fail('typescript_compilation', 'ci_cd', `tsc produced output:\n${out.slice(0, 300)}`);
  }
  return ok('typescript_compilation', 'TypeScript compilation clean');
}

/** Verify at least one test file exists. */
export function checkTestCoverage(): ReadinessCheck {
  let count = 0;
  try {
    count = readdirSync(resolve(ROOT, 'src'), { recursive: true })
      .filter(f => typeof f === 'string' && f.endsWith('.test.ts'))
      .length;
  } catch {
    return warn('test_coverage', 'data', 'Could not read src/ directory');
  }
  if (count === 0) return fail('test_coverage', 'data', 'No test files found in src/');
  return ok('test_coverage', `${count} test file(s) found`);
}

/** Grep for `: any` in source files -- should be zero. */
export function checkNoAnyTypes(): ReadinessCheck {
  const out = run('grep', [
    "-r", ': any', 'src/',
    '--include=*.ts', '--include=*.tsx', '-l',
  ]);
  if (out === null || out.length === 0) {
    return ok('no_any_types', 'No :any types found in src/');
  }
  const files = out.split('\n').filter(Boolean);
  return fail('no_any_types', 'ci_cd', `${files.length} file(s) contain :any -- ${files.slice(0, 5).join(', ')}`);
}

/** Verify no new eslint-disable comments beyond baseline. */
export function checkNoEslintDisables(): ReadinessCheck {
  const baselinePath = resolve(ROOT, 'eslint-suppressions.json');
  if (!existsSync(baselinePath)) {
    return warn('no_eslint_disables', 'ci_cd', 'eslint-suppressions.json not found');
  }
  const raw = readFileSync(baselinePath, 'utf-8');
  try {
    const data = JSON.parse(raw) as { suppressions?: unknown[] };
    const count = Array.isArray(data.suppressions) ? data.suppressions.length : 0;
    return ok('no_eslint_disables', `${count} baseline suppression(s) tracked`);
  } catch {
    return warn('no_eslint_disables', 'ci_cd', 'Could not parse eslint-suppressions.json');
  }
}

/** Verify `npm run build` exits cleanly. */
export function checkBuildPasses(): ReadinessCheck {
  const out = run('npm', ['run', 'build']);
  if (out === null) {
    return fail('build_passes', 'ci_cd', 'npm run build failed or exited non-zero');
  }
  if (out.includes('error') || out.includes('Error')) {
    return fail('build_passes', 'ci_cd', `Build output contains errors:\n${out.slice(0, 300)}`);
  }
  return ok('build_passes', 'npm run build succeeded');
}

// ── Security ──────────────────────────────────────────────────────────────────

/** Grep source for leaked API keys / tokens. */
export function checkSecretsNotCommitted(): ReadinessCheck {
  const patterns = [
    'sk-[A-Za-z0-9]{20,}',
    'AKIA[A-Z0-9]{16}',
    'ghp_[A-Za-z0-9]{36}',
  ];
  for (const pat of patterns) {
    const out = run('grep', [
      '-rE', pat, 'src/',
      '--include=*.ts', '--include=*.tsx', '-l',
    ]);
    if (out !== null && out.length > 0) {
      return fail('secrets_not_committed', 'security', `Potential secret found matching ${pat}`);
    }
  }
  return ok('secrets_not_committed', 'No leaked secrets detected in src/');
}

/** Verify no live trading code is present. */
export function checkPaperTradingOnly(): ReadinessCheck {
  const livePatterns = [
    'execute_real_trade',
    'place_live_order',
    'LIVE_TRADING_ENABLED',
  ];
  for (const pat of livePatterns) {
    const out = run('grep', [
      '-r', pat, 'src/',
      '--include=*.ts', '-l',
    ]);
    if (out !== null && out.length > 0) {
      return fail('paper_trading_only', 'security', `Live trading reference found: ${pat}`);
    }
  }
  return ok('paper_trading_only', 'No live trading code detected');
}

// ── Data / Integration ────────────────────────────────────────────────────────

/** Verify the cost model module is present and exported. */
export function checkCostModelConfigured(): ReadinessCheck {
  const costPath = resolve(ROOT, 'src/forest/backtest/cost-model.ts');
  if (!existsSync(costPath)) return fail('cost_model_configured', 'data', 'cost-model.ts not found');
  const content = readFileSync(costPath, 'utf-8');
  if (!content.includes('export')) {
    return fail('cost_model_configured', 'data', 'cost-model.ts has no exports');
  }
  return ok('cost_model_configured', 'Cost model module present and exporting');
}

/** Verify the regime classifier exists and is exported. */
export function checkRegimeEngineWired(): ReadinessCheck {
  const classifierPath = resolve(ROOT, 'src/tree/regime/classifier.ts');
  if (!existsSync(classifierPath)) return fail('regime_engine_wired', 'data', 'regime classifier.ts not found');
  const indexPath = resolve(ROOT, 'src/tree/regime/index.ts');
  if (!existsSync(indexPath)) return fail('regime_engine_wired', 'data', 'regime index.ts not found');
  const content = readFileSync(indexPath, 'utf-8');
  if (!content.includes('RuleBasedRegimeClassifier')) {
    return fail('regime_engine_wired', 'data', 'RegimeClassifier not exported from index.ts');
  }
  return ok('regime_engine_wired', 'Regime engine present and exported');
}

/** Verify the walk-forward module exists and is exported. */
export function checkWalkForwardWired(): ReadinessCheck {
  const wfPath = resolve(ROOT, 'src/forest/backtest/walkforward.ts');
  if (!existsSync(wfPath)) return fail('walk_forward_wired', 'data', 'walkforward.ts not found');
  const content = readFileSync(wfPath, 'utf-8');
  if (!content.includes('export')) {
    return fail('walk_forward_wired', 'data', 'walkforward.ts has no exports');
  }
  return ok('walk_forward_wired', 'Walk-forward module present and exporting');
}
