import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '../../../regime/types';
import {
  AlphaDecisionRecordSchema,
  CostStressTierSchema,
  FeatureSnapshotHashSchema,
  OperationalTelemetrySchema,
  PortfolioDecisionRecordSchema,
  ProviderProvenanceSchema,
  ShadowFillSchema,
  ShadowOrderSchema,
} from '../index';

describe('observability schemas', () => {
  const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  describe('FeatureSnapshotHashSchema', () => {
    it('accepts 64-character lowercase hexadecimal hash and trims whitespace', () => {
      const parsed = FeatureSnapshotHashSchema.parse(`  ${validHash}  `);
      expect(parsed).toBe(validHash);
    });

    it('rejects invalid lengths, uppercase characters, and non-hex inputs', () => {
      expect(() => FeatureSnapshotHashSchema.parse(validHash.slice(0, 63))).toThrow();
      expect(() => FeatureSnapshotHashSchema.parse(`${validHash}a`)).toThrow();
      expect(() => FeatureSnapshotHashSchema.parse(validHash.toUpperCase())).toThrow();
      expect(() => FeatureSnapshotHashSchema.parse('z'.repeat(64))).toThrow();
      expect(() => FeatureSnapshotHashSchema.parse(12345)).toThrow();
    });
  });

  describe('AlphaDecisionRecordSchema', () => {
    const validRecord = {
      alphaId: 'alpha-mom-01',
      direction: 'buy' as const,
      confidence: 0.85,
      expectedReturn: 0.0025,
      expectedCost: 0.0008,
      expectedTurnover: 0.15,
      regime: RegimeLabel.TREND_UP,
      horizon: '1h',
      featureDependencies: ['rsi_14', 'vol_20'],
      featureSnapshotHash: validHash,
      timestamp: 1727250000000,
      symbol: 'BTC/USDT',
      metadata: { source: 'unit-test' },
    };

    it('accepts valid record with all optional fields', () => {
      const result = AlphaDecisionRecordSchema.parse(validRecord);
      expect(result.alphaId).toBe('alpha-mom-01');
      expect(result.direction).toBe('buy');
    });

    it('rejects injected execution flags via .strict()', () => {
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, liveTrade: true })).toThrow();
    });

    it('rejects invalid direction or invalid regime', () => {
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, direction: 'flat' })).toThrow();
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, regime: 'UNKNOWN_REGIME' })).toThrow();
    });

    it('rejects out-of-bound confidence and negative costs/turnover', () => {
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, confidence: -0.1 })).toThrow();
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, confidence: 1.05 })).toThrow();
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, expectedCost: -0.001 })).toThrow();
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, expectedTurnover: -1 })).toThrow();
    });

    it('rejects non-finite numbers and non-positive timestamps', () => {
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, expectedReturn: NaN })).toThrow();
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, expectedReturn: Infinity })).toThrow();
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, timestamp: 0 })).toThrow();
      expect(() => AlphaDecisionRecordSchema.parse({ ...validRecord, timestamp: 1.5 })).toThrow();
    });
  });

  describe('PortfolioDecisionRecordSchema', () => {
    const validPortfolio = {
      decisionId: 'port-dec-001',
      targetWeights: { 'alpha-mom-01': 0.6, 'alpha-mean-02': -0.4 },
      grossExposure: 1.0,
      netExposure: 0.2,
      volTargetingScale: 0.95,
      activeRiskOverlayAdjustments: ['vol target: scaled by 0.95'],
      timestamp: 1727250000000,
      totalTurnover: 0.35,
      drawdownDeRisked: false,
    };

    it('accepts valid portfolio decision record', () => {
      const result = PortfolioDecisionRecordSchema.parse(validPortfolio);
      expect(result.grossExposure).toBe(1.0);
    });

    it('rejects injected properties via .strict()', () => {
      expect(() => PortfolioDecisionRecordSchema.parse({ ...validPortfolio, sendOrders: true })).toThrow();
    });

    it('rejects negative gross exposure or negative volTargetingScale', () => {
      expect(() => PortfolioDecisionRecordSchema.parse({ ...validPortfolio, grossExposure: -0.1 })).toThrow();
      expect(() => PortfolioDecisionRecordSchema.parse({ ...validPortfolio, volTargetingScale: -1 })).toThrow();
    });

    it('rejects invalid target weights record with empty keys or non-finite values', () => {
      expect(() => PortfolioDecisionRecordSchema.parse({ ...validPortfolio, targetWeights: { '': 0.5 } })).toThrow();
      expect(() => PortfolioDecisionRecordSchema.parse({ ...validPortfolio, targetWeights: { a: NaN } })).toThrow();
    });
  });

  describe('ProviderProvenanceSchema & OperationalTelemetrySchema', () => {
    const validProvenance = {
      primaryProvider: 'binance-ws',
      activeProvider: 'bybit-rest',
      usedFallback: true,
      fallbackAttempts: 2,
      providerLatencyMs: 42,
      circuitState: 'half_open' as const,
      errors: ['binance timeout'],
    };

    const validTelemetry = {
      decisionLatencyMs: 15.4,
      dataFreshnessMs: 250,
      providerProvenance: validProvenance,
      timestamp: 1727250000000,
    };

    it('validates provenance and operational telemetry', () => {
      expect(ProviderProvenanceSchema.parse(validProvenance).usedFallback).toBe(true);
      expect(OperationalTelemetrySchema.parse(validTelemetry).decisionLatencyMs).toBe(15.4);
    });

    it('rejects injected properties via .strict()', () => {
      expect(() => ProviderProvenanceSchema.parse({ ...validProvenance, unauthorized: 1 })).toThrow();
      expect(() => OperationalTelemetrySchema.parse({ ...validTelemetry, injected: 1 })).toThrow();
    });

    it('rejects negative latencies and negative fallback attempts', () => {
      expect(() => OperationalTelemetrySchema.parse({ ...validTelemetry, decisionLatencyMs: -5 })).toThrow();
      expect(() => OperationalTelemetrySchema.parse({ ...validTelemetry, dataFreshnessMs: -1 })).toThrow();
      expect(() => ProviderProvenanceSchema.parse({ ...validProvenance, fallbackAttempts: -1 })).toThrow();
      expect(() => ProviderProvenanceSchema.parse({ ...validProvenance, providerLatencyMs: -10 })).toThrow();
      expect(() => ProviderProvenanceSchema.parse({ ...validProvenance, circuitState: 'broken' })).toThrow();
    });
  });

  describe('ShadowOrderSchema, ShadowFillSchema & CostStressTierSchema', () => {
    const validOrder = {
      orderId: 'ord-sh-001',
      symbol: 'BTC/USDT',
      side: 'buy' as const,
      size: 50000,
      price: 65000.5,
      targetWeightDelta: 0.05,
      decisionTimestamp: 1727250000000,
    };

    const validFill = {
      fillId: 'fill-sh-001',
      orderId: 'ord-sh-001',
      symbol: 'BTC/USDT',
      side: 'buy' as const,
      fillPrice: 65005.0,
      fillQuantity: 0.769,
      fillTimestamp: 1727250000050,
      feeAmount: 40.0,
      slippageBps: 0.69,
      stressTier: 'adverse' as const,
    };

    it('validates forward-compatible shadow orders and fills', () => {
      expect(ShadowOrderSchema.parse(validOrder).size).toBe(50000);
      expect(ShadowFillSchema.parse(validFill).stressTier).toBe('adverse');
    });

    it('rejects injected properties on orders and fills via .strict()', () => {
      expect(() => ShadowOrderSchema.parse({ ...validOrder, liveBroker: 'interactive' })).toThrow();
      expect(() => ShadowFillSchema.parse({ ...validFill, executeOnExchange: true })).toThrow();
    });

    it('rejects non-positive order price/size and fill price/quantity', () => {
      expect(() => ShadowOrderSchema.parse({ ...validOrder, size: 0 })).toThrow();
      expect(() => ShadowOrderSchema.parse({ ...validOrder, price: -10 })).toThrow();
      expect(() => ShadowFillSchema.parse({ ...validFill, fillPrice: 0 })).toThrow();
      expect(() => ShadowFillSchema.parse({ ...validFill, fillQuantity: -1 })).toThrow();
      expect(() => ShadowFillSchema.parse({ ...validFill, feeAmount: -5 })).toThrow();
    });

    it('validates all cost stress tiers and rejects invalid tiers', () => {
      for (const tier of ['normal', 'conservative', 'adverse', 'extreme']) {
        expect(CostStressTierSchema.parse(tier)).toBe(tier);
      }
      expect(() => CostStressTierSchema.parse('catastrophic')).toThrow();
    });
  });
});
