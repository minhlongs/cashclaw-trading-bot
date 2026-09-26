import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const TREE_DIR = path.resolve(__dirname, '../../src/tree');
const TREE_DQ_DIR = path.resolve(TREE_DIR, 'alpha/data-quality');
const FOREST_DQ_DIR = path.resolve(__dirname, '../../src/forest/alpha/data-quality-eval');
const TEST_DIR = path.resolve(__dirname, '.');

function getTsFiles(dir: string, includeTests: boolean = false): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && (includeTests || entry.name !== '__tests__')) {
      files.push(...getTsFiles(fullPath, includeTests));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      if (includeTests || !entry.name.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

const FORBIDDEN_EXECUTION_IDENTIFIERS = [
  'OrderProvider',
  'ExchangeOrchestrator',
  'BotOrderExecutor',
  'LiveExchangeAdapter',
  'PaperExchangeAdapter',
  'placeOrder',
  'cancelOrder',
  'executeLive',
  'submitOrder',
  'transitionStrategy',
];

const FORBIDDEN_EXECUTION_IMPORTS = [
  '@/tree/exchange',
  '@/land/exchange-orchestration',
  '@/tree/bot',
  'ccxt',
];

describe('Phase 10: Data Quality Safety, Layer Purity & Architecture Invariants', () => {
  it('verifies Tree layer purity: 0 imports of forest from tree/alpha/data-quality', () => {
    const treeDqFiles = getTsFiles(TREE_DQ_DIR);
    expect(treeDqFiles.length).toBeGreaterThanOrEqual(10);
    for (const file of treeDqFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(TREE_DQ_DIR, file);
      const importsForest = /from\s+['"][^'"]*(?:src\/forest|@\/forest)/.test(content);
      expect(importsForest, `Tree file ${rel} illegally imports from forest`).toBe(false);
    }
  });

  it('verifies 0 files across entire src/tree/ import from data-quality-eval', () => {
    const allTreeFiles = getTsFiles(TREE_DIR);
    expect(allTreeFiles.length).toBeGreaterThanOrEqual(20);
    for (const file of allTreeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(TREE_DIR, file);
      expect(content.includes('data-quality-eval'), `Tree file ${rel} imports data-quality-eval`).toBe(false);
    }
  });

  it('verifies 0 live trading execution identifiers in data quality modules', () => {
    const modules = [...getTsFiles(TREE_DQ_DIR), ...getTsFiles(FOREST_DQ_DIR)];
    for (const file of modules) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(path.resolve(__dirname, '../../src'), file);
      for (const id of FORBIDDEN_EXECUTION_IDENTIFIERS) {
        const regex = new RegExp(`\\b${id}\\b`, 'g');
        expect(content.match(regex), `Forbidden token '${id}' found in ${rel}`).toBeNull();
      }
      for (const imp of FORBIDDEN_EXECUTION_IMPORTS) {
        expect(content.includes(imp), `Forbidden import '${imp}' found in ${rel}`).toBe(false);
      }
    }
  });

  it('verifies all data quality source files are strictly <= 200 lines', () => {
    const sourceFiles = [...getTsFiles(TREE_DQ_DIR), ...getTsFiles(FOREST_DQ_DIR)];
    for (const file of sourceFiles) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n').length;
      const rel = path.relative(path.resolve(__dirname, '../../src'), file);
      expect(lines, `Source file ${rel} has ${lines} lines (must be <= 200)`).toBeLessThanOrEqual(200);
    }
  });

  it('verifies all Phase 10 test suite files in test/alpha/ are strictly <= 200 lines', () => {
    const testFiles = [
      'data-quality-fixtures.ts',
      'tier1-feature-coverage.ts',
      'tier2-boundary-corners.ts',
      'tier3-pairwise-combinations.ts',
      'tier4-real-world-scenarios.ts',
      'data-quality-safety.test.ts',
      'data-quality.e2e.test.ts',
    ].map((f) => path.join(TEST_DIR, f));

    for (const file of testFiles) {
      if (fs.existsSync(file)) {
        const lines = fs.readFileSync(file, 'utf-8').split('\n').length;
        const rel = path.basename(file);
        expect(lines, `Test file ${rel} has ${lines} lines (must be <= 200)`).toBeLessThanOrEqual(200);
      }
    }
  });

  it('verifies zero console.log statements across all data quality source and test files', () => {
    const targetFiles = [
      ...getTsFiles(TREE_DQ_DIR),
      ...getTsFiles(FOREST_DQ_DIR),
      path.join(TEST_DIR, 'data-quality-fixtures.ts'),
      path.join(TEST_DIR, 'tier1-feature-coverage.ts'),
      path.join(TEST_DIR, 'tier2-boundary-corners.ts'),
      path.join(TEST_DIR, 'tier3-pairwise-combinations.ts'),
      path.join(TEST_DIR, 'tier4-real-world-scenarios.ts'),
      path.join(TEST_DIR, 'data-quality.e2e.test.ts'),
    ];
    for (const file of targetFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        const rel = path.basename(file);
        expect(content.includes('console.log'), `File ${rel} contains forbidden console.log`).toBe(false);
      }
    }
  });

  it('verifies zero ambient randomness (Math.random) in fixtures and test suite', () => {
    const testFiles = [
      path.join(TEST_DIR, 'data-quality-fixtures.ts'),
      path.join(TEST_DIR, 'tier1-feature-coverage.ts'),
      path.join(TEST_DIR, 'tier2-boundary-corners.ts'),
      path.join(TEST_DIR, 'tier3-pairwise-combinations.ts'),
      path.join(TEST_DIR, 'tier4-real-world-scenarios.ts'),
      path.join(TEST_DIR, 'data-quality.e2e.test.ts'),
    ];
    for (const file of testFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        const rel = path.basename(file);
        expect(content.includes('Math.random'), `File ${rel} contains forbidden Math.random`).toBe(false);
      }
    }
  });
});
