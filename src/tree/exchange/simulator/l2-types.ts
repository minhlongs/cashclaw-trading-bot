// L2 Realistic Paper Execution Simulator Contracts
// ADR-001 Invariant: Pure simulation for realistic queue position & slippage

export interface L2OrderBookLevel {
  readonly price: number;
  readonly size: number;
}

export interface L2OrderBookSnapshot {
  readonly symbol: string;
  readonly bids: readonly L2OrderBookLevel[];
  readonly asks: readonly L2OrderBookLevel[];
  readonly timestampMs: number;
}

export interface PublicTrade {
  readonly price: number;
  readonly size: number;
  readonly side: 'buy' | 'sell';
  readonly timestampMs: number;
}

export interface QueuePositionState {
  readonly orderId: string;
  readonly price: number;
  readonly initialAheadVolume: number;
  remainingAheadVolume: number;
  readonly isFilled: boolean;
}

export interface ExecutionSlippageResult {
  readonly requestedPrice: number;
  readonly executedPrice: number;
  readonly slippageBps: number;
  readonly totalCost: number;
}
