import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const EVAL_DIR = path.resolve(__dirname, '..');
const TREE_DIR = path.resolve(__dirname, '../../../../tree');
const TREE_OBS_DIR = path.resolve(TREE_DIR, 'alpha/observability');

function collectAllTsFiles(dir: string, excludeTests = false): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludeTests && entry.name === '__tests__') continue;
      results.push(...collectAllTsFiles(full, excludeTests));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      if (excludeTests && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts'))) continue;
      results.push(full);
    }
  }
  return results;
}

describe('Adversarial Layer Boundary & AST Verification', () => {
  const FORBIDDEN_IDENTIFIERS = [
    'OrderProvider',
    'ExchangeOrchestrator',
    'BotOrderExecutor',
    'LiveExchangeAdapter',
    'PaperExchangeAdapter',
    'placeOrder',
    'cancelOrder',
    'executeLive',
    'transitionStrategy',
    'executeTrade',
    'apiKey',
    'ccxt',
  ];

  const FORBIDDEN_IMPORTS = [
    '@/tree/exchange',
    '@/land/exchange-orchestration',
    '@/tree/bot',
    'ccxt',
  ];

  it('scans ALL files in src/tree/** and proves 0 import observability-eval', () => {
    const allTreeFiles = collectAllTsFiles(TREE_DIR, false);
    expect(allTreeFiles.length).toBeGreaterThan(50);

    for (const file of allTreeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(TREE_DIR, file);
      // Exclude isolation test suites that assert against the string
      if (file.includes('isolation')) continue;

      const hasImport = /import\s+.*['"][^'"]*observability-eval['"]/.test(content) ||
        /require\(['"][^'"]*observability-eval['"]\)/.test(content) ||
        /from\s+['"][^'"]*observability-eval['"]/.test(content);

      expect(hasImport, `Violation: ${rel} imports observability-eval`).toBe(false);
    }
  });

  it('scans src/tree/alpha/observability/** and proves 0 imports from forest', () => {
    const obsFiles = collectAllTsFiles(TREE_OBS_DIR, false);
    expect(obsFiles.length).toBeGreaterThanOrEqual(10);

    for (const file of obsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(TREE_OBS_DIR, file);
      if (file.includes('isolation')) continue;

      const hasForest = /from\s+['"][^'"]*(?:src\/forest|@\/forest|\.\.\/\.\.\/\.\.\/forest)/.test(content);
      expect(hasForest, `Violation: ${rel} imports forest`).toBe(false);
    }
  });

  it('scans all source files in observability-eval and proves 0 forbidden execution identifiers', () => {
    const sourceFiles = collectAllTsFiles(EVAL_DIR, true);
    expect(sourceFiles.length).toBeGreaterThanOrEqual(7);

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(EVAL_DIR, file);

      for (const id of FORBIDDEN_IDENTIFIERS) {
        const regex = new RegExp(`\\b${id}\\b`, 'g');
        const matches = content.match(regex);
        expect(matches, `Violation: ${rel} contains forbidden identifier '${id}'`).toBeNull();
      }

      for (const imp of FORBIDDEN_IMPORTS) {
        expect(content.includes(imp), `Violation: ${rel} contains forbidden import '${imp}'`).toBe(false);
      }
    }
  });

  it('proves zero dynamic eval or child_process or network imports in observability-eval', () => {
    const sourceFiles = collectAllTsFiles(EVAL_DIR, true);
    const dangerous = ['child_process', 'node:child_process', 'eval(', 'Function(', 'fetch(', 'node:net', 'node:http'];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(EVAL_DIR, file);

      for (const d of dangerous) {
        expect(content.includes(d), `Violation: ${rel} contains dangerous call '${d}'`).toBe(false);
      }
    }
  });
});
