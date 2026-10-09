export function computeDistributionStats(vals: readonly number[]) {
  const count = vals.length;
  if (count === 0) return { count: 0, mean: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const p95 = sorted[Math.max(0, Math.min(count - 1, Math.ceil(0.95 * count) - 1))]!;
  return {
    count,
    mean: Number((sorted.reduce((a, b) => a + b, 0) / count).toFixed(4)),
    median,
    p95,
    max: sorted[count - 1]!,
  };
}
