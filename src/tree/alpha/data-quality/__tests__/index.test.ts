import { describe, expect, it } from 'vitest';
import * as DataQuality from '../index';

describe('Data Quality Barrel (index.ts)', () => {
  it('exports all 9 individual pure validators', () => {
    expect(typeof DataQuality.validateMonotonicity).toBe('function');
    expect(typeof DataQuality.validateDuplicates).toBe('function');
    expect(typeof DataQuality.validateIntervals).toBe('function');
    expect(typeof DataQuality.validateStaleness).toBe('function');
    expect(typeof DataQuality.validateOHLC).toBe('function');
    expect(typeof DataQuality.validateVolume).toBe('function');
    expect(typeof DataQuality.validateAlignment).toBe('function');
    expect(typeof DataQuality.validateFutureData).toBe('function');
    expect(typeof DataQuality.validateOutage).toBe('function');
  });

  it('exports composite validator and timeframe utilities', () => {
    expect(typeof DataQuality.validateCandleSeries).toBe('function');
    expect(typeof DataQuality.parseTimeframe).toBe('function');
    expect(typeof DataQuality.isValidTimeframe).toBe('function');
  });

  it('executes validateCandleSeries correctly via barrel export', () => {
    const result = DataQuality.validateCandleSeries([]);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('status');
  });
});
