import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import {
  AlignmentConfigSchema,
  CandleSchema,
  CheckResultSchema,
  DataQualityAssessmentReportSchema,
  DataQualityConfigSchema,
  DataQualityEvalConfigSchema,
  DataQualityEvalInputSchema,
  FutureDataConfigSchema,
  MissingIntervalsConfigSchema,
  OutageConfigSchema,
  QualityViolationSchema,
  SignalGenerationResultSchema,
  StalenessConfigSchema,
  ValidationResultSchema,
  VolumeConfigSchema,
} from '../schemas';
import { protectSignalGeneration } from '../signal-fence';
import type { Candle } from '../types';

function createCandles(count: number = 5, intervalMs: number = 60_000, start: number = 1_700_000_000_000): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: start + i * intervalMs,
    open: 100 + i,
    high: 110 + i,
    low: 95 + i,
    close: 105 + i,
    volume: 1000 + i * 10,
  }));
}

describe('Challenger M2-1: Schemas & Cross-Alignment Stress Harness', () => {
  const baseTime = 1_700_000_000_000;
  const interval = 60_000;

  it('rejects extra keys and prototype pollution across all 15 Zod schemas', () => {
    const schemas = [
      CandleSchema,
      DataQualityEvalInputSchema,
      DataQualityConfigSchema,
      DataQualityEvalConfigSchema,
      DataQualityAssessmentReportSchema,
      SignalGenerationResultSchema,
      CheckResultSchema,
      QualityViolationSchema,
      ValidationResultSchema,
      MissingIntervalsConfigSchema,
      StalenessConfigSchema,
      VolumeConfigSchema,
      AlignmentConfigSchema,
      FutureDataConfigSchema,
      OutageConfigSchema,
    ];

    const roguePayload = { extraKey: 'adversarial_injection', rogue: 999 };
    for (const schema of schemas) {
      const res = schema.safeParse(roguePayload);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBeInstanceOf(ZodError);
      }
    }
  });

  it('rejects prototype-polluted JSON strings via strict schemas', () => {
    const json = '{"timestamp":1700000000000,"open":100,"high":110,"low":90,"close":100,"volume":10,"__proto__":{"pwn":true}}';
    const parsed = JSON.parse(json);
    const res = CandleSchema.safeParse(parsed);
    expect(res.success).toBe(false);
  });

  it('rejects NaN in numeric fields across Candle and Input schemas', () => {
    const baseCandle = { timestamp: baseTime, open: 100, high: 110, low: 90, close: 100, volume: 10 };
    for (const field of ['timestamp', 'open', 'high', 'low', 'close', 'volume']) {
      const corrupted = { ...baseCandle, [field]: NaN };
      expect(CandleSchema.safeParse(corrupted).success).toBe(false);
    }

    const inputBadAsOf = {
      series: [baseCandle],
      symbol: 'BTC/USDT',
      timeframe: '1m',
      asOf: NaN,
    };
    expect(DataQualityEvalInputSchema.safeParse(inputBadAsOf).success).toBe(false);
  });

  it('rejects invalid timeframe formats in DataQualityEvalInputSchema', () => {
    const baseCandle = { timestamp: baseTime, open: 100, high: 110, low: 90, close: 100, volume: 10 };
    const invalidTimeframes = ['', '   ', '\t', 123, null, undefined, {}, []];

    for (const tf of invalidTimeframes) {
      const res = DataQualityEvalInputSchema.safeParse({
        series: [baseCandle],
        symbol: 'BTC/USDT',
        timeframe: tf,
      });
      expect(res.success).toBe(false);
    }
  });

  it('fails closed when multi-source secondary feed drift exceeds tolerance', () => {
    const primary = createCandles(5, interval, baseTime);
    const secondary = primary.map((c) => ({ ...c, timestamp: c.timestamp + 5000 }));
    const generator = vi.fn();

    const result = protectSignalGeneration(
      {
        series: primary,
        secondarySeries: secondary,
        symbol: 'BTC/USDT',
        timeframe: '1m',
        asOf: baseTime + 10 * interval,
      },
      generator,
      { alignment: { toleranceMs: 1000 } },
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
    const alignCheck = result.report.validationResult.checkResults.find(
      (c) => c.dimension === 'cross_source_alignment',
    );
    expect(alignCheck?.passed).toBe(false);
  });

  it('fails closed when secondary series has missing intervals', () => {
    const primary = createCandles(6, interval, baseTime);
    const secondary = [primary[0], primary[1], primary[5]];
    const generator = vi.fn();

    const result = protectSignalGeneration(
      {
        series: primary,
        secondarySeries: secondary,
        symbol: 'ETH/USDT',
        timeframe: '1m',
        asOf: baseTime + 10 * interval,
      },
      generator,
      { alignment: { maxUnmatchedCandles: 0 } },
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('fails closed when secondary series is empty while primary is populated', () => {
    const primary = createCandles(4, interval, baseTime);
    const generator = vi.fn();

    const result = protectSignalGeneration(
      {
        series: primary,
        secondarySeries: [],
        symbol: 'SOL/USDT',
        timeframe: '1m',
        asOf: baseTime + 10 * interval,
      },
      generator,
    );

    expect(result.status).toBe('DATA_INVALID');
    expect(result.signal).toBeNull();
    expect(generator).not.toHaveBeenCalled();
  });

  it('allows signal generation when secondary feed alignment is within tolerance', () => {
    const primary = createCandles(5, interval, baseTime);
    const secondary = primary.map((c) => ({ ...c, timestamp: c.timestamp + 250 }));
    const generator = vi.fn().mockReturnValue({ action: 'REBALANCE', weight: 0.5 });

    const result = protectSignalGeneration(
      {
        series: primary,
        secondarySeries: secondary,
        symbol: 'BTC/USDT',
        timeframe: '1m',
        asOf: baseTime + 4 * interval + 10_000,
      },
      generator,
      { alignment: { toleranceMs: 500 } },
    );

    expect(result.status).toBe('VALID');
    expect(result.signal).toEqual({ action: 'REBALANCE', weight: 0.5 });
    expect(generator).toHaveBeenCalledTimes(1);
    const alignCheck = result.report.validationResult.checkResults.find(
      (c) => c.dimension === 'cross_source_alignment',
    );
    expect(alignCheck?.passed).toBe(true);
  });
});
