import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const EVAL_DIR = path.resolve(__dirname, '..');
const TREE_DIR = path.resolve(__dirname, '../../../../tree');
const TREE_OBS_DIR = path.resolve(TREE_DIR, 'alpha/observability');

function getTsSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '__tests__') {
      files.push(...getTsSourceFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Observability Seam Safety Isolation & Layer Purity', () => {
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
  ];

  const FORBIDDEN_IMPORTS = [
    '@/tree/exchange',
    '@/land/exchange-orchestration',
    '@/tree/bot',
    'ccxt',
  ];

  it('asserts 0 files in src/tree/ import from observability-eval', () => {
    const treeFiles = getTsSourceFiles(TREE_DIR);
    expect(treeFiles.length).toBeGreaterThan(10);
    for (const file of treeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        content.includes('observability-eval'),
        `Tree file ${path.relative(TREE_DIR, file)} violates layer boundary by importing observability-eval`,
      ).toBe(false);
    }
  });

  it('asserts 0 files in src/tree/alpha/observability/ import from forest', () => {
    const obsFiles = getTsSourceFiles(TREE_OBS_DIR);
    expect(obsFiles.length).toBeGreaterThanOrEqual(5);
    for (const file of obsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        /from\s+['"][^'"]*(?:src\/forest|@\/forest)/.test(content),
        `Observability file ${path.relative(TREE_OBS_DIR, file)} violates layer boundary by importing forest`,
      ).toBe(false);
    }
  });

  it('asserts 0 forbidden trading execution identifiers in observability-eval source', () => {
    const evalFiles = getTsSourceFiles(EVAL_DIR);
    expect(evalFiles.length).toBeGreaterThanOrEqual(5);
    for (const file of evalFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relPath = path.relative(EVAL_DIR, file);

      for (const id of FORBIDDEN_IDENTIFIERS) {
        const regex = new RegExp(`\\b${id}\\b`, 'g');
        expect(content.match(regex), `Found forbidden identifier '${id}' in ${relPath}`).toBeNull();
      }

      for (const imp of FORBIDDEN_IMPORTS) {
        expect(content.includes(imp), `Found forbidden import '${imp}' in ${relPath}`).toBe(false);
      }
    }
  });
});
