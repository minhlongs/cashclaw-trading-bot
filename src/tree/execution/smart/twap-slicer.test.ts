import { describe, it, expect } from 'vitest';
import { calculateTwapSlices } from './twap-slicer';

describe('twap-slicer', () => {
  it('returns empty array when configuration is invalid or zero', () => {
    expect(calculateTwapSlices({ totalQuantity: 0, durationMinutes: 10, sliceCount: 5 })).toEqual([]);
    expect(calculateTwapSlices({ totalQuantity: 10, durationMinutes: 0, sliceCount: 5 })).toEqual([]);
    expect(calculateTwapSlices({ totalQuantity: 10, durationMinutes: 10, sliceCount: 0 })).toEqual([]);
  });

  it('correctly divides total quantity across slices and applies deterministic jitter', () => {
    const slices = calculateTwapSlices(
      { totalQuantity: 10, durationMinutes: 5, sliceCount: 5, jitterRatio: 0.1 },
      [0.5, 0.5, 0.5, 0.5, 0.5],
    );

    expect(slices).toHaveLength(5);
    const sumQty = slices.reduce((acc, s) => acc + s.targetQuantity, 0);
    expect(sumQty).toBeCloseTo(10, 5);
    expect(slices[0].scheduledDelayMs).toBe(0);
    expect(slices[1].scheduledDelayMs).toBeGreaterThan(0);
    expect(slices[4].executionUrgency).toBe('AGGRESSIVE_TAKER');
  });
});
