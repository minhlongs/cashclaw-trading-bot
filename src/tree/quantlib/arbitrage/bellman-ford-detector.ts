import type { RateGraphEdge, TriangularArbitrageOpportunity } from './triangular-types';

export function detectTriangularArbitrage(
  edges: readonly RateGraphEdge[],
  startSymbol = 'USDT',
  minProfitBps = 1.0,
): TriangularArbitrageOpportunity | null {
  // Build adjacency lookup for fast 3-leg traversal
  const adj = new Map<string, RateGraphEdge[]>();
  for (const e of edges) {
    const list = adj.get(e.fromSymbol) ?? [];
    list.push(e);
    adj.set(e.fromSymbol, list);
  }

  const leg1Edges = adj.get(startSymbol) ?? [];
  let bestOpportunity: TriangularArbitrageOpportunity | null = null;
  let maxProfitBps = minProfitBps;

  for (const leg1 of leg1Edges) {
    const symB = leg1.toSymbol;
    if (symB === startSymbol) continue;

    const leg2Edges = adj.get(symB) ?? [];
    for (const leg2 of leg2Edges) {
      const symC = leg2.toSymbol;
      if (symC === startSymbol || symC === symB) continue;

      const leg3Edges = adj.get(symC) ?? [];
      for (const leg3 of leg3Edges) {
        if (leg3.toSymbol !== startSymbol) continue;

        // Found 3-cycle: start -> symB -> symC -> start
        const grossMultiplier = leg1.rate * leg2.rate * leg3.rate;
        const totalLogWeight = leg1.logWeight + leg2.logWeight + leg3.logWeight;
        const netMultiplier = Math.exp(-totalLogWeight);
        const netProfitBps = (netMultiplier - 1.0) * 10_000;

        if (netProfitBps > maxProfitBps) {
          maxProfitBps = netProfitBps;
          const bottleneckDepth = Math.min(
            leg1.depthSize,
            leg2.depthSize * leg1.rate,
            leg3.depthSize * leg1.rate * leg2.rate,
          );

          bestOpportunity = {
            cycleSymbols: [startSymbol, symB, symC, startSymbol],
            edges: [leg1, leg2, leg3],
            grossMultiplier: Math.round(grossMultiplier * 1e8) / 1e8,
            netMultiplier: Math.round(netMultiplier * 1e8) / 1e8,
            netProfitBps: Math.round(netProfitBps * 1e2) / 1e2,
            bottleneckDepth: Math.round(bottleneckDepth * 1e4) / 1e4,
          };
        }
      }
    }
  }

  return bestOpportunity;
}
