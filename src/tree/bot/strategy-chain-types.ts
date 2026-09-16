// Bot Engine — StrategyChain Types
// OmniRoute Phase 4: chain leg & strategy composition

import type { BotConfig } from './config-types';

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
  strategy: 'grid' | 'mean_reversion' | 'volatility_dca';
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

export function hasStrategyChain(
  config: BotConfig,
): config is BotConfig & { strategyChain: ChainLeg[] } {
  return Array.isArray(config.strategyChain) &&
    config.strategyChain.length > 0;
}
