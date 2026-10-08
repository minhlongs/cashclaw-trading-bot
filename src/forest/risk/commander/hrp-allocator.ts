import type { BotPerformanceRecord, HrpAllocationResult } from './fleet-types';

export function computeSampleVariance(series: readonly number[]): number {
  if (series.length < 2) return 0.0001;
  const mean = series.reduce((acc, val) => acc + val, 0) / series.length;
  const sumSq = series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  return Math.max(0.000001, sumSq / (series.length - 1));
}

export function computeHrpAllocation(
  bots: readonly BotPerformanceRecord[],
  timestampMs = Date.now(),
): HrpAllocationResult {
  if (bots.length === 0) {
    return { allocations: {}, clusterOrder: [], timestampMs };
  }

  // Calculate inverse variance for each bot
  const variances = bots.map((b) => computeSampleVariance(b.returnsSeries));
  const inverseVariances = variances.map((v) => 1 / v);
  const totalInverseVariance = inverseVariances.reduce((acc, v) => acc + v, 0);

  const allocations: Record<string, number> = {};
  for (let i = 0; i < bots.length; i++) {
    allocations[bots[i].botId] = inverseVariances[i] / totalInverseVariance;
  }

  const clusterOrder = [...bots]
    .sort((a, b) => (allocations[b.botId] ?? 0) - (allocations[a.botId] ?? 0))
    .map((b) => b.botId);

  return {
    allocations,
    clusterOrder,
    timestampMs,
  };
}
