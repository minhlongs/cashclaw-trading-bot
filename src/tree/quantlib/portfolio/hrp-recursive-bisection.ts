export interface HrpAllocatorParams {
  readonly symbols: readonly string[]; readonly volatilities: readonly number[]; readonly correlationMatrix: readonly (readonly number[])[];
}
export interface HrpAssetAllocation {
  readonly symbol: string; readonly originalIndex: number; readonly quasiDiagRank: number;
  readonly volatility: number; readonly hrpWeight: number; readonly inverseVolWeight: number; readonly equalWeight: number;
}
export interface HrpAllocationResult {
  readonly seriatedSymbols: readonly string[]; readonly distanceMatrix: readonly (readonly number[])[];
  readonly portfolioVolatility: number; readonly diversificationRatio: number; readonly allocations: readonly HrpAssetAllocation[];
}

function buildCovarianceAndDistance(vols: readonly number[], corr: readonly (readonly number[])[]) {
  const n = vols.length;
  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const dist: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const rho = i === j ? 1 : Math.max(-0.999, Math.min(0.999, corr[i]?.[j] ?? 0));
      cov[i]![j] = (vols[i] ?? 0.01) * (vols[j] ?? 0.01) * rho;
      dist[i]![j] = i === j ? 0 : Number(Math.sqrt(Math.max(0, 0.5 * (1 - rho))).toFixed(6));
    }
  }
  return { cov, dist };
}

function seriateQuasiDiagonal(dist: readonly (readonly number[])[]): number[] {
  const n = dist.length;
  if (n <= 1) return [0];
  const visited = new Set<number>([0]);
  const order: number[] = [0];
  while (order.length < n) {
    const last = order[order.length - 1]!;
    let [bestNext, bestDist] = [0, Number.POSITIVE_INFINITY];
    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && (dist[last]?.[j] ?? 1) < bestDist) {
        bestDist = dist[last]?.[j] ?? 1;
        bestNext = j;
      }
    }
    visited.add(bestNext);
    order.push(bestNext);
  }
  return order;
}

function computeClusterVariance(cluster: readonly number[], cov: readonly (readonly number[])[]): number {
  const ivp = cluster.map((idx) => 1 / Math.max(1e-8, cov[idx]?.[idx] ?? 1e-4));
  const sumIvp = ivp.reduce((acc, v) => acc + v, 0);
  const w = ivp.map((v) => v / sumIvp);
  let variance = 0;
  for (let a = 0; a < cluster.length; a++) {
    for (let b = 0; b < cluster.length; b++) variance += w[a]! * w[b]! * (cov[cluster[a]!]?.[cluster[b]!] ?? 0);
  }
  return Math.max(1e-10, variance);
}
export function computeHrpRecursiveBisection(params: HrpAllocatorParams): HrpAllocationResult {
  const n = params.symbols.length;
  const { cov, dist } = buildCovarianceAndDistance(params.volatilities, params.correlationMatrix);
  const order = seriateQuasiDiagonal(dist);
  const rawWeights = Array<number>(n).fill(1);
  const queue: number[][] = [order];
  while (queue.length > 0) {
    const cluster = queue.shift()!;
    if (cluster.length <= 1) continue;
    const mid = Math.floor(cluster.length / 2);
    const [left, right] = [cluster.slice(0, mid), cluster.slice(mid)];
    const [vLeft, vRight] = [computeClusterVariance(left, cov), computeClusterVariance(right, cov)];
    const alpha = 1 - vLeft / (vLeft + vRight);
    for (const idx of left) rawWeights[idx] = (rawWeights[idx] ?? 1) * alpha;
    for (const idx of right) rawWeights[idx] = (rawWeights[idx] ?? 1) * (1 - alpha);
    queue.push(left, right);
  }
  const totalW = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map((w) => w / totalW);
  const invVolRaw = params.volatilities.map((v) => 1 / Math.max(1e-6, v));
  const invVolSum = invVolRaw.reduce((a, b) => a + b, 0);
  let [portVar, weightedVolSum] = [0, 0];
  for (let i = 0; i < n; i++) {
    weightedVolSum += weights[i]! * (params.volatilities[i] ?? 0.01);
    for (let j = 0; j < n; j++) portVar += weights[i]! * weights[j]! * cov[i]![j]!;
  }
  const portVol = Math.sqrt(Math.max(1e-10, portVar));
  return {
    seriatedSymbols: order.map((idx) => params.symbols[idx]!), distanceMatrix: dist,
    portfolioVolatility: Number(portVol.toFixed(6)), diversificationRatio: Number((weightedVolSum / portVol).toFixed(4)),
    allocations: params.symbols.map((symbol, i) => ({
      symbol, originalIndex: i, quasiDiagRank: order.indexOf(i) + 1, volatility: params.volatilities[i]!,
      hrpWeight: Number(weights[i]!.toFixed(6)), inverseVolWeight: Number((invVolRaw[i]! / invVolSum).toFixed(6)), equalWeight: Number((1 / n).toFixed(6)),
    })),
  };
}
