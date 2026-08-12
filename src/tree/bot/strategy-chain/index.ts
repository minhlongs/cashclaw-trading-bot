// StrategyChain orchestrator — OmniRoute Phase 4
// Evaluates first matching strategy in the chain, with optional fallback.

import type {
  ChainStrategy,
  StrategyChain,
  StrategyContext,
  TradeSignal,
  ChainLeg,
} from './types';
import { buildDefaultChain } from './leg-builder';

export { type ChainStrategy, type StrategyChain, type StrategyContext, type TradeSignal, type ChainLeg };

export { buildDefaultChain } from './leg-builder';
