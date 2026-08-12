// Chain leg builder — OmniRoute Phase 4
// Constructs StrategyChain from BotConfig legs; supports optional fallback.

import type { ChainStrategy, StrategyChain, ChainLeg, StrategyContext, TradeSignal } from './types';
import { createGridChainStrategy } from './strategies/grid';
import { createMeanRevChainStrategy } from './strategies/mean-reversion';
import type { GridBotConfig, MeanRevBotConfig, BotConfig } from '@/tree/bot/types';

export function buildDefaultChain(config: BotConfig): StrategyChain {
  if (!Array.isArray((config as any).strategyChain)) {
    return [];
  }

  const legs: ChainLeg[] = (config as any).strategyChain as ChainLeg[];
  const nodes: StrategyChain = [];
  let strategy: ChainStrategy | null = null;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.strategy === 'grid') strategy = createGridChainStrategy({ type: 'grid', gridConfig: config as GridBotConfig });
    else if (leg.strategy === 'mean_reversion') strategy = createMeanRevChainStrategy({ type: 'mean_reversion', meanRevConfig: config as MeanRevBotConfig });

    if (!strategy) continue;

    const nextLeg = legs[i + 1];
    let fallback: ChainStrategy | null = null;

    if (nextLeg) {
      if (nextLeg.strategy === 'grid') fallback = createGridChainStrategy({ type: 'grid', gridConfig: config as GridBotConfig });
      else if (nextLeg.strategy === 'mean_reversion') fallback = createMeanRevChainStrategy({ type: 'mean_reversion', meanRevConfig: config as MeanRevBotConfig });
    }

    nodes.push({ strategy, fallback });
  }

  return nodes;
}
