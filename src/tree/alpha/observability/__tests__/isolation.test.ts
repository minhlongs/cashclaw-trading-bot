import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  AlphaDecisionRecordSchema,
  OperationalTelemetrySchema,
  ShadowFillSchema,
  ShadowOrderSchema,
} from '../schemas';

const OBSERVABILITY_DIR = path.resolve(__dirname, '..');
const TREE_DIR = path.resolve(__dirname, '../../..');

function getTsSourceFiles(dir: string): string[] {
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

describe('Tree Layer Purity & Execution Isolation (Master Mission §14 / Safety Fence)', () => {
  const obsSourceFiles = getTsSourceFiles(OBSERVABILITY_DIR);
  const treeSourceFiles = getTsSourceFiles(TREE_DIR);

  it('confirms observability and tree source files are present for static scan', () => {
    expect(obsSourceFiles.length).toBeGreaterThanOrEqual(5);
    expect(treeSourceFiles.length).toBeGreaterThan(obsSourceFiles.length);
  });

  describe('Static Scan: Zero Live Execution Identifiers in Observability', () => {
    const FORBIDDEN_IDENTIFIERS = [
      'ccxt',
      '@/tree/exchange',
      '@/land/exchange-orchestration',
      'OrderProvider',
      'ExchangeOrchestrator',
      'placeOrder',
      'cancelOrder',
      'BotOrderExecutor',
      'LiveExchangeAdapter',
      'PaperExchangeAdapter',
    ];

    for (const file of obsSourceFiles) {
      const relPath = path.relative(OBSERVABILITY_DIR, file);

      it(`asserts ${relPath} contains zero live trading execution identifiers`, () => {
        const content = fs.readFileSync(file, 'utf-8');
        for (const id of FORBIDDEN_IDENTIFIERS) {
          const isPath = id.startsWith('@/') || id.startsWith('ccxt');
          const regex = isPath ? new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : new RegExp(`\\b${id}\\b`);
          const matches = content.match(regex);
          expect(matches, `Found forbidden live execution identifier '${id}' in ${relPath}`).toBeNull();
        }
      });

      it(`asserts ${relPath} contains zero imports from forest layer`, () => {
        const content = fs.readFileSync(file, 'utf-8');
        const hasForestImport = /from\s+['"][^'"]*(?:src\/forest|@\/forest)/.test(content);
        expect(hasForestImport, `Found forest import in ${relPath}`).toBe(false);
      });
    }
  });

  describe('Tree Layer Purity: Zero Imports of Observability-Eval in Tree', () => {
    it('asserts 0 files across entire src/tree/** import from observability-eval', () => {
      for (const file of treeSourceFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const hasImport = /from\s+['"][^'"]*observability-eval/.test(content);
        expect(
          hasImport,
          `Tree file ${path.relative(TREE_DIR, file)} violates layer boundary by importing observability-eval`,
        ).toBe(false);
      }
    });
  });

  describe('Runtime Fail-Closed Fences: Rejection of Execution Injections via Strict Schemas', () => {
    it('rejects injected trade execution commands into AlphaDecisionRecordSchema', () => {
      const injected = {
        alphaId: 'a1', direction: 'buy', confidence: 0.8, expectedReturn: 0.02,
        expectedCost: 0.001, expectedTurnover: 0.1, regime: 'TREND_UP', horizon: '1h',
        featureDependencies: ['feat1'], featureSnapshotHash: 'a'.repeat(64), timestamp: 1000,
        placeOrder: true, sendToExchange: true,
      };
      expect(() => AlphaDecisionRecordSchema.parse(injected)).toThrow();
    });

    it('rejects injected live execution parameters into ShadowOrderSchema', () => {
      const injected = {
        orderId: 'o1', symbol: 'BTC/USDT', side: 'buy', size: 1000, price: 50000,
        targetWeightDelta: 0.1, decisionTimestamp: 1000, executeLive: true, ccxtExchange: 'binance',
      };
      expect(() => ShadowOrderSchema.parse(injected)).toThrow();
    });

    it('rejects injected live execution credentials into ShadowFillSchema', () => {
      const injected = {
        fillId: 'f1', orderId: 'o1', symbol: 'BTC/USDT', side: 'buy', fillPrice: 50000,
        fillQuantity: 0.02, fillTimestamp: 1050, feeAmount: 8, slippageBps: 8, stressTier: 'normal',
        liveFillReceipt: '0x123',
      };
      expect(() => ShadowFillSchema.parse(injected)).toThrow();
    });

    it('rejects injected live order credentials into OperationalTelemetrySchema', () => {
      const injected = {
        decisionLatencyMs: 25, dataFreshnessMs: 50,
        providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0 },
        apiKey: 'secret-live-key',
      };
      expect(() => OperationalTelemetrySchema.parse(injected)).toThrow();
    });
  });
});
