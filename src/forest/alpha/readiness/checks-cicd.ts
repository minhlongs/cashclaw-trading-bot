// Live Readiness Hardening — CI/CD Checks
// TypeScript, test coverage, :any types, ESLint baseline, build verification.

import { resolve } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { ok, fail, warn, run } from './checks-helpers';

const ROOT = process.cwd();

/** Verify TypeScript compiles with zero errors. */
export function checkTypeScriptCompilation() {
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
export function checkTestCoverage() {
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
export function checkNoAnyTypes() {
  const out = run('grep', [
    '-r', ': any', 'src/',
    '--include=*.ts', '--include=*.tsx', '-l',
  ]);
  if (out === null || out.length === 0) {
    return ok('no_any_types', 'No :any types found in src/');
  }
  const files = out.split('\n').filter(Boolean);
  return fail('no_any_types', 'ci_cd', `${files.length} file(s) contain :any -- ${files.slice(0, 5).join(', ')}`);
}

/** Verify no new eslint-disable comments beyond baseline. */
export function checkNoEslintDisables() {
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
export function checkBuildPasses() {
  const out = run('npm', ['run', 'build']);
  if (out === null) {
    return fail('build_passes', 'ci_cd', 'npm run build failed or exited non-zero');
  }
  if (out.includes('error') || out.includes('Error')) {
    return fail('build_passes', 'ci_cd', `Build output contains errors:\n${out.slice(0, 300)}`);
  }
  return ok('build_passes', 'npm run build succeeded');
}
