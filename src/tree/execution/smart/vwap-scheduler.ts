// Pure VWAP Volume-Weighted Distribution Scheduler
import type { VwapVolumeBucket } from './smart-execution-types';

export function scheduleVwapSlices(
  totalQuantity: number,
  currentHourUtc: number,
  horizonHours: number,
  profiles: readonly VwapVolumeBucket[],
): readonly { hourUtc: number; allocatedQuantity: number; weightPct: number }[] {
  if (totalQuantity <= 0 || horizonHours <= 0 || profiles.length === 0) {
    return [];
  }

  const activeHours: number[] = [];
  for (let i = 0; i < horizonHours; i++) {
    activeHours.push((currentHourUtc + i) % 24);
  }

  const profileMap = new Map<number, number>(
    profiles.map((p) => [p.hourUtc, Math.max(0, p.relativeVolumeWeight)]),
  );

  const rawWeights = activeHours.map((h) => profileMap.get(h) ?? 1 / 24);
  const totalWeight = rawWeights.reduce((a, b) => a + b, 0);

  if (totalWeight <= 0) {
    return [];
  }

  return activeHours.map((hourUtc, idx) => {
    const normalizedWeight = rawWeights[idx] / totalWeight;
    const allocatedQuantity = Number((totalQuantity * normalizedWeight).toFixed(8));
    return {
      hourUtc,
      allocatedQuantity,
      weightPct: Number((normalizedWeight * 100).toFixed(2)),
    };
  });
}
