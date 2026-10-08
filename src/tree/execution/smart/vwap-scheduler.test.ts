import { describe, it, expect } from 'vitest';
import { scheduleVwapSlices } from './vwap-scheduler';

describe('vwap-scheduler', () => {
  it('returns empty array when quantity or horizon is invalid', () => {
    expect(scheduleVwapSlices(0, 10, 4, [{ hourUtc: 10, relativeVolumeWeight: 1 }])).toEqual([]);
    expect(scheduleVwapSlices(100, 10, 0, [{ hourUtc: 10, relativeVolumeWeight: 1 }])).toEqual([]);
    expect(scheduleVwapSlices(100, 10, 4, [])).toEqual([]);
  });

  it('allocates volume proportional to intraday curve profile', () => {
    const profiles = [
      { hourUtc: 12, relativeVolumeWeight: 0.1 },
      { hourUtc: 13, relativeVolumeWeight: 0.2 },
      { hourUtc: 14, relativeVolumeWeight: 0.3 },
      { hourUtc: 15, relativeVolumeWeight: 0.4 },
    ];

    const schedules = scheduleVwapSlices(1000, 12, 4, profiles);
    expect(schedules).toHaveLength(4);
    expect(schedules[0].allocatedQuantity).toBe(100);
    expect(schedules[1].allocatedQuantity).toBe(200);
    expect(schedules[2].allocatedQuantity).toBe(300);
    expect(schedules[3].allocatedQuantity).toBe(400);
  });
});
