// StrategyChain orchestrator — OmniRoute Phase 4
// Evaluates first matching strategy in the chain, with optional fallback.

export { type ChainStrategy, type StrategyChain, type StrategyContext, type TradeSignal, type ChainLeg } from './types';
export { buildDefaultChain } from './leg-builder';
