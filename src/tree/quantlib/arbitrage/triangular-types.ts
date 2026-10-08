export interface RateGraphEdge {
  readonly fromSymbol: string;
  readonly toSymbol: string;
  readonly rate: number;
  readonly feeBps: number;
  readonly depthSize: number;
  readonly logWeight: number;
}

export interface TriangularArbitrageOpportunity {
  readonly cycleSymbols: readonly string[];
  readonly edges: readonly RateGraphEdge[];
  readonly grossMultiplier: number;
  readonly netMultiplier: number;
  readonly netProfitBps: number;
  readonly bottleneckDepth: number;
}
