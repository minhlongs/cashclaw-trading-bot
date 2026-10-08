import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '../../../regime/types';
import {
  AlphaDecisionDirectionSchema,
  AlphaDecisionRecordSchema,
  CostStressTierSchema,
  FeatureSnapshotHashSchema,
  OperationalTelemetrySchema,
  PortfolioDecisionRecordSchema,
  ProviderProvenanceSchema,
  ShadowFillSchema,
  ShadowOrderSchema,
} from '../index';

describe('Adversarial Schemas & Boundaries Stress Tests', () => {
  const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const baseAlpha = {
    alphaId: 'alpha-arb-01', direction: 'buy' as const, confidence: 0.9,
    expectedReturn: 0.0015, expectedCost: 0.0005, expectedTurnover: 0.2,
    regime: RegimeLabel.TREND_UP, horizon: '1h',
    featureDependencies: ['spread', 'depth'], featureSnapshotHash: validHash,
    timestamp: 1727250000000,
  };

  const basePortfolio = {
    targetWeights: { 'alpha-arb-01': 0.5 }, grossExposure: 0.8, netExposure: 0.2,
    volTargetingScale: 1.0, activeRiskOverlayAdjustments: ['scale: 1.0'], timestamp: 1727250000000,
  };

  const baseProvenance = {
    primaryProvider: 'binance-ws', activeProvider: 'binance-ws', usedFallback: false, fallbackAttempts: 0,
  };

  const baseTelemetry = {
    decisionLatencyMs: 12.5, dataFreshnessMs: 100, providerProvenance: baseProvenance, timestamp: 1727250000000,
  };

  const baseOrder = {
    orderId: 'ord-001', symbol: 'ETH/USDT', side: 'buy' as const, size: 25000,
    price: 3500.0, targetWeightDelta: 0.05, decisionTimestamp: 1727250000000,
  };

  const baseFill = {
    fillId: 'fill-001', orderId: 'ord-001', symbol: 'ETH/USDT', side: 'buy' as const,
    fillPrice: 3500.5, fillQuantity: 7.14, fillTimestamp: 1727250000025,
    feeAmount: 1.75, slippageBps: 1.4, stressTier: 'normal' as const,
  };

  describe('Anti-Injection Stress Tests (.strict() fail-closed verification)', () => {
    const schemas = [
      { name: 'AlphaDecisionRecord', schema: AlphaDecisionRecordSchema, base: baseAlpha },
      { name: 'PortfolioDecisionRecord', schema: PortfolioDecisionRecordSchema, base: basePortfolio },
      { name: 'ProviderProvenance', schema: ProviderProvenanceSchema, base: baseProvenance },
      { name: 'OperationalTelemetry', schema: OperationalTelemetrySchema, base: baseTelemetry },
      { name: 'ShadowOrder', schema: ShadowOrderSchema, base: baseOrder },
      { name: 'ShadowFill', schema: ShadowFillSchema, base: baseFill },
    ];

    it.each(schemas)('rejects injected executeLive: true in $name', ({ schema, base }) => {
      const injected = { ...base, executeLive: true };
      expect(() => schema.parse(injected)).toThrow(/unrecognized_keys/);
      expect(schema.safeParse(injected).success).toBe(false);
    });

    it.each(schemas)('rejects injected placeOrder: "BUY" in $name', ({ schema, base }) => {
      const injected = { ...base, placeOrder: 'BUY' };
      expect(() => schema.parse(injected)).toThrow(/unrecognized_keys/);
      expect(schema.safeParse(injected).success).toBe(false);
    });

    it.each(schemas)('rejects JSON-parsed __proto__ injection in $name', ({ schema, base }) => {
      const parsed = JSON.parse(JSON.stringify({ ...base, ['__proto__']: { isAdmin: true } }));
      expect(() => schema.parse(parsed)).toThrow(/unrecognized_keys/);
      expect(schema.safeParse(parsed).success).toBe(false);
    });

    it.each(schemas)('rejects computed [__proto__] property in $name', ({ schema, base }) => {
      const injected = Object.assign({}, base, { ['__proto__']: { polluted: true } });
      expect(() => schema.parse(injected)).toThrow();
      expect(schema.safeParse(injected).success).toBe(false);
    });

    it('rejects injected symbol in schemas without symbol definition', () => {
      const noSymbol = [PortfolioDecisionRecordSchema, ProviderProvenanceSchema, OperationalTelemetrySchema];
      const bases = [basePortfolio, baseProvenance, baseTelemetry];
      noSymbol.forEach((s, idx) => {
        expect(() => s.parse({ ...bases[idx], symbol: 'BTC' })).toThrow(/unrecognized_keys/);
      });
    });

    it('rejects prototype inheritance of unauthorized properties via .strict()', () => {
      const obj = Object.assign(Object.create({ executeLive: true }), baseAlpha);
      expect(() => AlphaDecisionRecordSchema.parse(obj)).toThrow(/unrecognized_keys/);
      expect(AlphaDecisionRecordSchema.safeParse(obj).success).toBe(false);
    });

    it('rejects invalid symbol bounds when symbol is permitted', () => {
      ['', '   ', 'X'.repeat(51)].forEach((sym) => {
        expect(() => AlphaDecisionRecordSchema.parse({ ...baseAlpha, symbol: sym })).toThrow();
      });
      expect(() => ShadowOrderSchema.parse({ ...baseOrder, symbol: '' })).toThrow();
      expect(() => ShadowFillSchema.parse({ ...baseFill, symbol: '' })).toThrow();
    });
  });

  describe('Boundary Stress Tests (Numeric & Logical Range Fencing)', () => {
    it('enforces confidence bounds [0, 1] strictly', () => {
      [-0.01, 1.01, NaN, Infinity].forEach((val) => {
        expect(() => AlphaDecisionRecordSchema.parse({ ...baseAlpha, confidence: val })).toThrow();
      });
      expect(AlphaDecisionRecordSchema.parse({ ...baseAlpha, confidence: 0 }).confidence).toBe(0);
      expect(AlphaDecisionRecordSchema.parse({ ...baseAlpha, confidence: 1 }).confidence).toBe(1);
    });

    it('enforces expectedCost, turnover, and volTargetingScale non-negativity', () => {
      expect(() => AlphaDecisionRecordSchema.parse({ ...baseAlpha, expectedCost: -1 })).toThrow();
      expect(() => AlphaDecisionRecordSchema.parse({ ...baseAlpha, expectedCost: -0.0001 })).toThrow();
      expect(() => AlphaDecisionRecordSchema.parse({ ...baseAlpha, expectedTurnover: -1 })).toThrow();
      expect(() => PortfolioDecisionRecordSchema.parse({ ...basePortfolio, volTargetingScale: -0.5 })).toThrow();
      expect(() => PortfolioDecisionRecordSchema.parse({ ...basePortfolio, grossExposure: -0.01 })).toThrow();
    });

    it('enforces operational telemetry latency and freshness non-negativity', () => {
      expect(() => OperationalTelemetrySchema.parse({ ...baseTelemetry, decisionLatencyMs: -10 })).toThrow();
      expect(() => OperationalTelemetrySchema.parse({ ...baseTelemetry, dataFreshnessMs: -1 })).toThrow();
      expect(() => ProviderProvenanceSchema.parse({ ...baseProvenance, fallbackAttempts: -1 })).toThrow();
      expect(() => ProviderProvenanceSchema.parse({ ...baseProvenance, providerLatencyMs: -5 })).toThrow();
    });

    it('rejects invalid enum values for direction, regime, and stressTier', () => {
      ['BUY', 'close', ''].forEach((d) => expect(() => AlphaDecisionDirectionSchema.parse(d)).toThrow());
      ['INVALID_REGIME', 'BULL', ''].forEach((r) =>
        expect(() => AlphaDecisionRecordSchema.parse({ ...baseAlpha, regime: r as never })).toThrow(),
      );
      ['catastrophic', 'EXTREME', ''].forEach((t) => expect(() => CostStressTierSchema.parse(t)).toThrow());
    });

    it('enforces integer and positive bounds on all timestamps', () => {
      [0, -1, 1727250000000.5, NaN, Infinity].forEach((ts) => {
        expect(() => AlphaDecisionRecordSchema.parse({ ...baseAlpha, timestamp: ts })).toThrow();
        expect(() => PortfolioDecisionRecordSchema.parse({ ...basePortfolio, timestamp: ts })).toThrow();
        expect(() => ShadowOrderSchema.parse({ ...baseOrder, decisionTimestamp: ts })).toThrow();
        expect(() => ShadowFillSchema.parse({ ...baseFill, fillTimestamp: ts })).toThrow();
      });
    });

    it('rejects non-finite numbers across numerical fields', () => {
      [NaN, Infinity, -Infinity].forEach((nf) => {
        expect(() => AlphaDecisionRecordSchema.parse({ ...baseAlpha, expectedReturn: nf })).toThrow();
        expect(() => PortfolioDecisionRecordSchema.parse({ ...basePortfolio, netExposure: nf })).toThrow();
        expect(() => ShadowOrderSchema.parse({ ...baseOrder, price: nf })).toThrow();
        expect(() => ShadowFillSchema.parse({ ...baseFill, feeAmount: nf })).toThrow();
      });
    });

    it('enforces positive bounds on shadow order and fill sizes/prices', () => {
      [0, -100].forEach((v) => {
        expect(() => ShadowOrderSchema.parse({ ...baseOrder, size: v })).toThrow();
        expect(() => ShadowOrderSchema.parse({ ...baseOrder, price: v })).toThrow();
        expect(() => ShadowFillSchema.parse({ ...baseFill, fillPrice: v })).toThrow();
        expect(() => ShadowFillSchema.parse({ ...baseFill, fillQuantity: v })).toThrow();
      });
    });

    it('enforces 64-char lowercase hex on FeatureSnapshotHashSchema', () => {
      [validHash.slice(0, 63), `${validHash}0`, validHash.toUpperCase(), 'g'.repeat(64), '', '   '].forEach((h) => {
        expect(() => FeatureSnapshotHashSchema.parse(h)).toThrow();
      });
      expect(FeatureSnapshotHashSchema.parse(`  ${validHash}  `)).toBe(validHash);
    });
  });
});
