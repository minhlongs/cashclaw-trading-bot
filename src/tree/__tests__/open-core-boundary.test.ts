import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function collectTsFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
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

  it('Step 2, 4, 5: Dual-license, trademark, security, and contributing docs exist', () => {
    const license = fs.readFileSync(path.join(REPO_ROOT, 'LICENSE'), 'utf8');
    const eeLicense = fs.readFileSync(path.join(REPO_ROOT, 'src/ee/LICENSE-COMMERCIAL.md'), 'utf8');
    const trademark = fs.readFileSync(path.join(REPO_ROOT, 'TRADEMARK.md'), 'utf8');
    const security = fs.readFileSync(path.join(REPO_ROOT, 'SECURITY.md'), 'utf8');
    const contributing = fs.readFileSync(path.join(REPO_ROOT, 'CONTRIBUTING.md'), 'utf8');

    expect(license).toContain('Apache License');
    expect(license).toContain('src/ee/');
    expect(eeLicense).toContain('CashClaw Enterprise & Cloud SaaS Commercial License');
    expect(trademark).toContain('CashClaw');
    expect(security).toContain('PAPER/BACKTEST ONLY');
    expect(contributing).toContain('200 LOC');
  });

  it('Step 3: Pure Apache-2.0 layers (src/tree and src/land) never import from src/ee', () => {
    const ossFiles = [
      ...collectTsFiles(path.join(REPO_ROOT, 'src/tree')),
      ...collectTsFiles(path.join(REPO_ROOT, 'src/land')),
    ];

    expect(ossFiles.length).toBeGreaterThan(50);

    const violations: string[] = [];
    const eeImportPattern = /from\s+['"](?:@\/ee|\.\.\/.*\/ee\/)/;

    for (const file of ossFiles) {
      const source = fs.readFileSync(file, 'utf8');
      if (eeImportPattern.test(source)) {
        violations.push(path.relative(REPO_ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });
});
