// StrategyChain types — OmniRoute Phase 4
// Declarative composable strategy interface with precondition gating.

export interface StrategyContext {
  symbol: string;
  balance: number;
  openPositions: number;
  lastPrice: number;
}

export interface TradeSignal {
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  reason: string;
}

export interface ChainLeg {
  strategy: 'grid' | 'mean_reversion';
  on: string;
}

export interface ChainStrategy {
  name: string;
  evaluate(ctx: StrategyContext): TradeSignal | null;
}

export interface ChainNode {
  strategy: ChainStrategy;
  fallback: ChainStrategy | null;
}

export type StrategyChain = ChainNode[];

export interface PreconditionResult {
  pass: boolean;
  reason: string;
}

export type PreconditionFn = (ctx: StrategyContext) => PreconditionResult;
