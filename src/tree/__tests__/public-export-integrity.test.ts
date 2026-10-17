// Automated Test Suite for Public Export Integrity & Packaging
// Ensures Apache-2.0 release artifacts are cleanly isolated and production-ready.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { auditPackageSanity } from '../../../scripts/audit-oss-package';
import { volatilityDca, grid, meanReversion, quantFunctions } from '../quantlib';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('Public OSS Packaging & Export Integrity', () => {
  it('verifies package.json exports mapping does not leak src/ee', () => {
    const pkgPath = path.join(REPO_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      exports?: Record<string, string>;
    };

    expect(pkg.exports).toBeDefined();
    expect(pkg.exports?.['.']).toBe('./src/tree/quantlib/index.ts');
    expect(pkg.exports?.['./quantlib']).toBe('./src/tree/quantlib/index.ts');

    for (const [key, target] of Object.entries(pkg.exports ?? {})) {
      expect(target).not.toContain('src/ee');
      expect(key).not.toContain('ee');
    }
  });

  it('auditPackageSanity runs clean with zero boundary errors', () => {
    const report = auditPackageSanity();

    expect(report.clean).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.checkedFilesCount).toBeGreaterThanOrEqual(3);
  });

  it('quantlib public exports provide deterministic strategy functions', () => {
    expect(typeof volatilityDca).toBe('function');
    expect(typeof grid).toBe('function');
    expect(typeof meanReversion).toBe('function');
    expect(quantFunctions.volatility_dca).toBeDefined();

    const result = volatilityDca({
      symbol: 'BTC/USDT',
      balance: 1000,
      lastPrice: 65000,
    });

    expect(result.signal).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
