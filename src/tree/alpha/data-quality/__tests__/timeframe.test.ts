import { describe, expect, it } from 'vitest';
import { isValidTimeframe, parseTimeframe } from '../timeframe';

describe('timeframe utilities', () => {
  it('parses valid seconds correctly', () => {
    expect(parseTimeframe('1s')).toBe(1_000);
    expect(parseTimeframe('15s')).toBe(15_000);
    expect(parseTimeframe('30s')).toBe(30_000);
  });

  it('parses valid minutes correctly', () => {
    expect(parseTimeframe('1m')).toBe(60_000);
    expect(parseTimeframe('5m')).toBe(300_000);
    expect(parseTimeframe('15m')).toBe(900_000);
    expect(parseTimeframe('30m')).toBe(1_800_000);
  });

  it('parses valid hours correctly', () => {
    expect(parseTimeframe('1h')).toBe(3_600_000);
    expect(parseTimeframe('4h')).toBe(14_400_000);
    expect(parseTimeframe('12h')).toBe(43_200_000);
  });

  it('parses valid days, weeks, months, and years', () => {
    expect(parseTimeframe('1d')).toBe(86_400_000);
    expect(parseTimeframe('1w')).toBe(604_800_000);
    expect(parseTimeframe('1M')).toBe(2_592_000_000);
    expect(parseTimeframe('1y')).toBe(31_536_000_000);
  });

  it('handles surrounding whitespace gracefully', () => {
    expect(parseTimeframe('  5m  ')).toBe(300_000);
  });

  it('throws on invalid timeframe strings', () => {
    expect(() => parseTimeframe('')).toThrow('Invalid timeframe string');
    expect(() => parseTimeframe('invalid')).toThrow('Invalid timeframe format');
    expect(() => parseTimeframe('5x')).toThrow('Invalid timeframe format');
    expect(() => parseTimeframe('0m')).toThrow('Invalid timeframe format');
    expect(() => parseTimeframe('-1m')).toThrow('Invalid timeframe format');
  });

  it('validates timeframe strings with isValidTimeframe', () => {
    expect(isValidTimeframe('1m')).toBe(true);
    expect(isValidTimeframe('4h')).toBe(true);
    expect(isValidTimeframe('1d')).toBe(true);
    expect(isValidTimeframe('')).toBe(false);
    expect(isValidTimeframe('abc')).toBe(false);
    expect(isValidTimeframe('0h')).toBe(false);
    expect(isValidTimeframe('10z')).toBe(false);
  });
});
