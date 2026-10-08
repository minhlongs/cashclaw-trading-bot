import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  AlphaDecisionRecordSchema,
  FeatureSnapshotHashSchema,
  OperationalTelemetrySchema,
  PortfolioDecisionRecordSchema,
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

describe('Adversarial Tree Isolation & Fail-Closed Fences', () => {
  const obsSourceFiles = getTsSourceFiles(OBSERVABILITY_DIR);
  const treeSourceFiles = getTsSourceFiles(TREE_DIR);

  describe('Static AST & File Scan: Forbidden Exchange & Live Execution Identifiers', () => {
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
      'executeLive',
      'liveFillReceipt',
    ];

    it('scans all observability source files for forbidden execution references', () => {
      expect(obsSourceFiles.length).toBeGreaterThanOrEqual(5);

      for (const file of obsSourceFiles) {
        const relPath = path.relative(OBSERVABILITY_DIR, file);
        const content = fs.readFileSync(file, 'utf-8');

        for (const id of FORBIDDEN_IDENTIFIERS) {
          const isPath = id.startsWith('@/') || id.startsWith('ccxt');
          const regex = isPath ? new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : new RegExp(`\\b${id}\\b`);
          expect(content.match(regex), `Found forbidden identifier '${id}' in ${relPath}`).toBeNull();
        }

        const hasForestImport = /from\s+['"][^'"]*(?:src\/forest|@\/forest)/.test(content);
        expect(hasForestImport, `Found forbidden forest import in ${relPath}`).toBe(false);
      }
    });

    it('verifies 0 files across entire src/tree/** import from observability-eval', () => {
      for (const file of treeSourceFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const hasImport = /from\s+['"][^'"]*observability-eval/.test(content);
        expect(hasImport, `File ${path.relative(TREE_DIR, file)} violates boundary by importing observability-eval`).toBe(false);
      }
    });
  });

  describe('Adversarial Injection Attacks into Telemetry & Decision Schemas', () => {
    const validHash = 'a'.repeat(64);

    it('fails closed when trade execution command is injected into AlphaDecisionRecord', () => {
      const payload = {
        alphaId: 'alpha-1', direction: 'buy', confidence: 0.9, expectedReturn: 0.02,
        expectedCost: 0.001, expectedTurnover: 0.1, regime: 'TREND_UP', horizon: '1h',
        featureDependencies: ['spread'], featureSnapshotHash: validHash, timestamp: 1727250000000,
        placeOrder: true, sendToExchange: true, executeImmediately: true,
      };
      expect(() => AlphaDecisionRecordSchema.parse(payload)).toThrow(/unrecognized_keys/i);
    });

    it('fails closed when live order parameters are injected into ShadowOrder', () => {
      const payload = {
        orderId: 'ord-1', symbol: 'BTC/USDT', side: 'buy', size: 100, price: 60000,
        targetWeightDelta: 0.05, decisionTimestamp: 1727250000000,
        executeLive: true, ccxtExchange: 'binance', brokerApiKey: 'sec-key',
      };
      expect(() => ShadowOrderSchema.parse(payload)).toThrow(/unrecognized_keys/i);
    });

    it('fails closed when live credentials or API keys are injected into OperationalTelemetry', () => {
      const payload = {
        decisionLatencyMs: 15, dataFreshnessMs: 40,
        providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0 },
        apiKey: 'secret-live-key', exchangeApiSecret: 'secret-key',
      };
      expect(() => OperationalTelemetrySchema.parse(payload)).toThrow(/unrecognized_keys/i);
    });

    it('fails closed when live fill receipts are injected into ShadowFill', () => {
      const payload = {
        fillId: 'fill-1', orderId: 'ord-1', symbol: 'BTC/USDT', side: 'buy',
        fillPrice: 60000, fillQuantity: 0.1, fillTimestamp: 1727250000005,
        feeAmount: 3.5, slippageBps: 2.5, stressTier: 'normal',
        liveFillReceipt: '0x123abc', exchangeTxId: 'binance-tx-999',
      };
      expect(() => ShadowFillSchema.parse(payload)).toThrow(/unrecognized_keys/i);
    });

    it('fails closed when order routing is injected into PortfolioDecisionRecord', () => {
      const payload = {
        targetWeights: { 'alpha-1': 0.5 }, grossExposure: 0.5, netExposure: 0.5,
        volTargetingScale: 1.0, activeRiskOverlayAdjustments: [], timestamp: 1727250000000,
        routeToLiveExchange: true, submitToBroker: true,
      };
      expect(() => PortfolioDecisionRecordSchema.parse(payload)).toThrow(/unrecognized_keys/i);
    });

    it('fails closed on malformed or malicious feature snapshot hashes', () => {
      expect(() => FeatureSnapshotHashSchema.parse('A'.repeat(64))).toThrow(); // uppercase rejected
      expect(() => FeatureSnapshotHashSchema.parse('a'.repeat(63))).toThrow(); // length 63 rejected
      expect(() => FeatureSnapshotHashSchema.parse('a'.repeat(65))).toThrow(); // length 65 rejected
      expect(() => FeatureSnapshotHashSchema.parse('g'.repeat(64))).toThrow(); // invalid hex char
      expect(() => FeatureSnapshotHashSchema.parse("'; DROP TABLE alpha;--")).toThrow(); // SQL injection attempt
      expect(() => FeatureSnapshotHashSchema.parse('<script>alert(1)</script>')).toThrow(); // XSS payload attempt
    });

    it('fails closed on prototype pollution payloads in telemetry records', () => {
      const maliciousJson = '{"decisionLatencyMs":20,"dataFreshnessMs":50,"providerProvenance":{"primaryProvider":"binance","activeProvider":"binance","usedFallback":false,"fallbackAttempts":0},"__proto__":{"polluted":true}}';
      const parsed = JSON.parse(maliciousJson);
      expect(() => OperationalTelemetrySchema.parse(parsed)).toThrow(/unrecognized_keys/i);
    });
  });
});
