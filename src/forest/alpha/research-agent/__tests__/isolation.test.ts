// CashClaw Alpha Research OS — Automated Static Isolation & Safety Fence Test
// Master Mission §10 / Requirement R2 & Layer Invariant
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { HypothesisProposalSchema } from '../schemas';

const RESEARCH_AGENT_DIR = path.resolve(__dirname, '..');
const TREE_DIR = path.resolve(__dirname, '../../../../tree');

function getSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '__tests__') {
      files.push(...getSourceFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function getTreeSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...getTreeSourceFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

describe('ResearchAgent Safety Isolation Fence (Master Mission §10 / R2)', () => {
  const sourceFiles = getSourceFiles(RESEARCH_AGENT_DIR);

  it('verifies research-agent source files exist to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  describe('Static Source Code Scanning for Forbidden Identifiers', () => {
    const FORBIDDEN_IDENTIFIERS = [
      'OrderProvider',
      'ExchangeOrchestrator',
      'BotOrderExecutor',
      'LiveExchangeAdapter',
      'PaperExchangeAdapter',
      'transitionStrategy',
      'gateResultToTrigger',
      'SurvivalGateConfig',
      'runSurvivalGate',
    ];

    const FORBIDDEN_IMPORT_PATHS = [
      '@/tree/exchange',
      '@/land/exchange-orchestration',
      '@/tree/bot',
      '@/forest/alpha/gate/promotion-states',
      '@/forest/alpha/gate/survival-gate',
    ];

    for (const file of sourceFiles) {
      const relPath = path.relative(RESEARCH_AGENT_DIR, file);

      it(`asserts ${relPath} contains 0 forbidden identifiers`, () => {
        const content = fs.readFileSync(file, 'utf-8');
        for (const identifier of FORBIDDEN_IDENTIFIERS) {
          const regex = new RegExp(`\\b${identifier}\\b`, 'g');
          const matches = content.match(regex);
          expect(matches, `Found forbidden identifier '${identifier}' in ${relPath}`).toBeNull();
        }
      });

      it(`asserts ${relPath} contains 0 forbidden imports`, () => {
        const content = fs.readFileSync(file, 'utf-8');
        for (const importPath of FORBIDDEN_IMPORT_PATHS) {
          expect(content.includes(importPath), `Found forbidden import '${importPath}' in ${relPath}`).toBe(false);
        }
      });
    }
  });

  describe('Tree Layer Purity (Tree Never Imports Forest ResearchAgent)', () => {
    const treeFiles = getTreeSourceFiles(TREE_DIR);

    it('asserts 0 files in src/tree/ import from research-agent', () => {
      for (const file of treeFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(
          content.includes('research-agent'),
          `Tree file ${path.relative(TREE_DIR, file)} violates layer boundary by importing research-agent`,
        ).toBe(false);
      }
    });
  });

  describe('Runtime Fail-Closed Fences & Injection Resistance', () => {
    it('rejects injected trade execution commands via strict schema', () => {
      const maliciousPayload = {
        id: 'h-1',
        title: 'Title',
        rationale: 'Rationale text',
        domainCategory: 'microstructure',
        proposedMetrics: { sharpe: 1.0 },
        falsificationCriteria: ['drawdown > 0.2'],
        action: 'BUY',
        symbol: 'BTCUSDT',
        amount: 10,
      };
      expect(() => HypothesisProposalSchema.parse(maliciousPayload)).toThrow();
    });

    it('rejects injected promotion state mutations via strict schema', () => {
      const maliciousPayload = {
        id: 'h-1',
        title: 'Title',
        rationale: 'Rationale text',
        domainCategory: 'microstructure',
        proposedMetrics: { sharpe: 1.0 },
        falsificationCriteria: ['drawdown > 0.2'],
        transitionStrategy: 'LIVE',
        status: 'SURVIVED',
      };
      expect(() => HypothesisProposalSchema.parse(maliciousPayload)).toThrow();
    });
  });
});
