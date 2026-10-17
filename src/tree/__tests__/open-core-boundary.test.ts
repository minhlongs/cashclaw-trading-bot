import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function collectSourceFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|js)$/.test(entry.name) &&
      !/\.test\.(ts|tsx|js)$/.test(entry.name)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

const EE_IMPORT_PATTERNS: readonly RegExp[] = [
  /import\s+[\s\S]*?\s+from\s+['"](?:@\/ee(?:\/|$)|(?:\.\.?\/)+ee(?:\/|$))/,
  /export\s+[\s\S]*?\s+from\s+['"](?:@\/ee(?:\/|$)|(?:\.\.?\/)+ee(?:\/|$))/,
  /import\s*\(\s*['"](?:@\/ee(?:\/|$)|(?:\.\.?\/)+ee(?:\/|$))/,
  /require\s*\(\s*['"](?:@\/ee(?:\/|$)|(?:\.\.?\/)+ee(?:\/|$))/,
];

export function hasEeImportLeak(source: string): boolean {
  return EE_IMPORT_PATTERNS.some((pattern) => pattern.test(source));
}

describe('Phase 1 (Steps 1-5): Open-Core Apache-2.0 & EE Commercial Boundary', () => {
  it('Step 1: .gitignore and .npmignore exclude local agent harnesses and secrets', () => {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    const npmignore = fs.readFileSync(path.join(REPO_ROOT, '.npmignore'), 'utf8');

    expect(gitignore).toContain('.claude/');
    expect(gitignore).toContain('.agentkit/');
    expect(gitignore).toContain('.env');
    expect(npmignore).toContain('.claude/');
    expect(npmignore).toContain('src/ee/');
  });

  it('Step 2, 4, 5: Dual-license, trademark, security, contributing, and code-of-conduct docs exist', () => {
    const license = fs.readFileSync(path.join(REPO_ROOT, 'LICENSE'), 'utf8');
    const eeLicense = fs.readFileSync(path.join(REPO_ROOT, 'src/ee/LICENSE-COMMERCIAL.md'), 'utf8');
    const trademark = fs.readFileSync(path.join(REPO_ROOT, 'TRADEMARK.md'), 'utf8');
    const security = fs.readFileSync(path.join(REPO_ROOT, 'SECURITY.md'), 'utf8');
    const contributing = fs.readFileSync(path.join(REPO_ROOT, 'CONTRIBUTING.md'), 'utf8');
    const coc = fs.readFileSync(path.join(REPO_ROOT, 'CODE_OF_CONDUCT.md'), 'utf8');

    expect(license).toContain('Apache License');
    expect(license).toContain('src/ee/');
    expect(eeLicense).toContain('CashClaw Enterprise & Cloud SaaS Commercial License');
    expect(trademark).toContain('CashClaw');
    expect(security).toContain('PAPER/BACKTEST ONLY');
    expect(contributing).toContain('200 LOC');
    expect(coc).toContain('Contributor Covenant');
  });

  it('Step 3: Pure Apache-2.0 layers (tree, land, forest, lib, bin) never import from src/ee', () => {
    const ossDirectories = [
      path.join(REPO_ROOT, 'src/tree'),
      path.join(REPO_ROOT, 'src/land'),
      path.join(REPO_ROOT, 'src/forest'),
      path.join(REPO_ROOT, 'src/lib'),
      path.join(REPO_ROOT, 'bin'),
    ];

    const ossFiles = ossDirectories.flatMap(collectSourceFiles);
    expect(ossFiles.length).toBeGreaterThan(100);

    const violations: string[] = [];
    for (const file of ossFiles) {
      const source = fs.readFileSync(file, 'utf8');
      if (hasEeImportLeak(source)) {
        violations.push(path.relative(REPO_ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('Step 3b: Boundary regex catches static, dynamic, re-export, and relative EE imports', () => {
    expect(hasEeImportLeak("import { TenantPolicy } from '@/ee/tenancy/tenant-policy';")).toBe(true);
    expect(hasEeImportLeak("export { QuotaGuard } from '@/ee/billing/quota-guard';")).toBe(true);
    expect(hasEeImportLeak("const mod = await import('@/ee/scheduler/cloud');")).toBe(true);
    expect(hasEeImportLeak("const mod = require('../../ee/billing');")).toBe(true);
    expect(hasEeImportLeak("import { QuantLib } from '@/tree/quantlib';")).toBe(false);
  });
});
