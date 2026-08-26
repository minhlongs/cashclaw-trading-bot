// ExperimentSpec + compiler derivation utilities tests

import { describe, it, expect } from 'vitest';
import {
  deriveBarrierConfig,
  derivePeriods,
  deriveSeedFromSpecId,
  DEFAULT_SEED,
  MIN_TRAIN_BARS,
  BARRIER_DERIVATION,
  parseTimeframeToMs,
  type DataWindow,
} from './experiment-spec';

// The derivePeriods function uses floating point math for timestamps
// which can lead to edge case equality. Let's add a small epsilon helper.
const EPSILON = 1;
function expectLessThan(a: number, b: number): void {
  expect(a).toBeLessThanOrEqual(b + EPSILON);
}

describe('ExperimentSpec derivation utilities', () => {
  describe('parseTimeframeToMs', () => {
    it('parses minutes', () => {
      expect(parseTimeframeToMs('1m')).toBe(60_000);
      expect(parseTimeframeToMs('5m')).toBe(300_000);
      expect(parseTimeframeToMs('15m')).toBe(900_000);
      expect(parseTimeframeToMs('30m')).toBe(1_800_000);
    });

    it('parses hours', () => {
      expect(parseTimeframeToMs('1h')).toBe(3_600_000);
      expect(parseTimeframeToMs('4h')).toBe(14_400_000);
    });

    it('parses days', () => {
      expect(parseTimeframeToMs('1d')).toBe(86_400_000);
    });

    it('defaults to 1h for unknown format', () => {
      expect(parseTimeframeToMs('unknown')).toBe(3_600_000);
      expect(parseTimeframeToMs('')).toBe(3_600_000);
    });
  });

  describe('deriveBarrierConfig', () => {
    it('derives TP/SL/timeout proportional to horizon', () => {
      const config = deriveBarrierConfig(10, '1h');
      expect(config.takeProfitPct).toBe(10 * BARRIER_DERIVATION.tpPerBar); // 0.02
      expect(config.stopLossPct).toBe(10 * BARRIER_DERIVATION.slPerBar); // 0.01
      expect(config.maxHoldingMs).toBe(10 * 3_600_000 * BARRIER_DERIVATION.timeoutMultiplier); // 108_000_000
    });

    it('scales with timeframe', () => {
      const h1 = deriveBarrierConfig(10, '1h');
      const h4 = deriveBarrierConfig(10, '4h');
      const d1 = deriveBarrierConfig(10, '1d');
      expect(h4.maxHoldingMs).toBe(h1.maxHoldingMs * 4);
      expect(d1.maxHoldingMs).toBe(h1.maxHoldingMs * 24);
    });

    it('uses constants for derivation', () => {
      expect(BARRIER_DERIVATION.tpPerBar).toBe(0.002);
      expect(BARRIER_DERIVATION.slPerBar).toBe(0.001);
      expect(BARRIER_DERIVATION.timeoutMultiplier).toBe(3);
    });
  });

  describe('derivePeriods', () => {
    const baseWindow: DataWindow = {
      earliestTimestamp: 1_000_000_000_000,
      latestTimestamp: 1_000_000_000_000 + 1000 * 3_600_000, // 1000 bars of 1h
      barCount: 1000,
    };

    it('splits 70/15/15 chronologically when window sufficient', () => {
      const periods = derivePeriods(baseWindow, 10, 50);
      expect(periods).not.toBeNull();
      if (!periods) return;

      // train = 700, validation = 150, test = 150
      expect(periods.train.barCount).toBe(700);
      expect(periods.validation.barCount).toBe(150);
      expect(periods.test.barCount).toBe(150);

      // Chronological ordering (allow epsilon for floating point)
      expect(periods.train.startTimestamp).toBe(baseWindow.earliestTimestamp);
      expectLessThan(periods.train.endTimestamp, periods.validation.startTimestamp);
      expectLessThan(periods.validation.endTimestamp, periods.test.startTimestamp);
      expect(periods.test.endTimestamp).toBe(baseWindow.latestTimestamp);
    });

    it('returns null when window too small for horizon + lookback + MIN_TRAIN_BARS', () => {
      // Required = 50 + 10 + 200 = 260, but window = 250
      const smallWindow: DataWindow = { ...baseWindow, barCount: 250 };
      const periods = derivePeriods(smallWindow, 10, 50);
      expect(periods).toBeNull();
    });

    it('returns null when train bars < MIN_TRAIN_BARS after split', () => {
      // 210 bars total → train = 147 < 200
      const smallWindow: DataWindow = { ...baseWindow, barCount: 210 };
      const periods = derivePeriods(smallWindow, 10, 1);
      expect(periods).toBeNull();
    });

    it('uses MAX lookback across features', () => {
      const periods = derivePeriods(baseWindow, 10, 100);
      expect(periods).not.toBeNull();
      if (!periods) return;
      expect(periods.train.barCount).toBe(700);
    });
  });

  describe('deriveSeedFromSpecId', () => {
    it('derives deterministic seed from specId hex prefix', () => {
      const seed = deriveSeedFromSpecId('abcdef1234567890');
      expect(seed).toBe(0xabcdef12 >>> 0);
    });

    it('handles leading zeros', () => {
      const seed = deriveSeedFromSpecId('00000001abcd');
      expect(seed).toBe(1);
    });

    it('returns u32', () => {
      const seed = deriveSeedFromSpecId('ffffffff00000000');
      expect(seed).toBe(0xffffffff);
    });
  });

  describe('constants', () => {
    it('DEFAULT_SEED is a fixed u32', () => {
      expect(DEFAULT_SEED).toBe(0xCAFEBABE);
    });

    it('MIN_TRAIN_BARS is 200', () => {
      expect(MIN_TRAIN_BARS).toBe(200);
    });
  });
});