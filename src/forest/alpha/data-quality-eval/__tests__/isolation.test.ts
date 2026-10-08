import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import * as barrel from '../index';

const EVAL_DIR = path.resolve(__dirname, '..');
const TREE_DIR = path.resolve(__dirname, '../../../../tree');
const TREE_DQ_DIR = path.resolve(TREE_DIR, 'alpha/data-quality');

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

describe('Data Quality Seam Safety Isolation & Layer Purity', () => {
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

  it('asserts 0 files in src/tree/ import from data-quality-eval', () => {
    const treeFiles = getTsSourceFiles(TREE_DIR);
    expect(treeFiles.length).toBeGreaterThan(10);
    for (const file of treeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        content.includes('data-quality-eval'),
        `Tree file ${path.relative(TREE_DIR, file)} violates layer boundary by importing data-quality-eval`,
      ).toBe(false);
    }
  });

  it('asserts 0 files in src/tree/alpha/data-quality/ import from forest', () => {
    const dqFiles = getTsSourceFiles(TREE_DQ_DIR);
    expect(dqFiles.length).toBeGreaterThanOrEqual(10);
    for (const file of dqFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        /from\s+['"][^'"]*(?:src\/forest|@\/forest)/.test(content),
        `Tree data quality file ${path.relative(TREE_DQ_DIR, file)} violates layer purity by importing forest`,
      ).toBe(false);
    }
  });

  it('asserts 0 forbidden trading execution identifiers or imports in data-quality-eval source', () => {
    const evalFiles = getTsSourceFiles(EVAL_DIR);
    expect(evalFiles.length).toBeGreaterThanOrEqual(5);

    for (const file of evalFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relPath = path.relative(EVAL_DIR, file);

      for (const id of FORBIDDEN_EXECUTION_IDENTIFIERS) {
        const regex = new RegExp(`\\b${id}\\b`, 'g');
        expect(
          content.match(regex),
          `Found forbidden execution identifier '${id}' in ${relPath}`,
        ).toBeNull();
      }

      for (const imp of FORBIDDEN_EXECUTION_IMPORTS) {
        expect(
          content.includes(imp),
          `Found forbidden execution import '${imp}' in ${relPath}`,
        ).toBe(false);
      }
    }
  });

  it('asserts all source files in data-quality-eval are strictly <= 200 lines', () => {
    const evalFiles = getTsSourceFiles(EVAL_DIR);
    for (const file of evalFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lineCount = content.split('\n').length;
      expect(
        lineCount,
        `File ${path.relative(EVAL_DIR, file)} exceeds 200 lines limit (${lineCount} lines)`,
      ).toBeLessThanOrEqual(200);
    }
  });

  it('asserts zero console.log statements in data-quality-eval source files', () => {
    const evalFiles = getTsSourceFiles(EVAL_DIR);
    for (const file of evalFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(
        content.includes('console.log'),
        `File ${path.relative(EVAL_DIR, file)} contains forbidden console.log`,
      ).toBe(false);
    }
  });

  it('verifies barrel export surface in index.ts', () => {
    expect(barrel.evaluateDataQuality).toBeDefined();
    expect(barrel.protectSignalGeneration).toBeDefined();
    expect(barrel.assertDataQualityValid).toBeDefined();
    expect(barrel.DataQualityAssertionError).toBeDefined();
    expect(barrel.generateDataQualityReport).toBeDefined();
    expect(barrel.CandleSchema).toBeDefined();
    expect(barrel.DataQualityAssessmentReportSchema).toBeDefined();
  });
});
