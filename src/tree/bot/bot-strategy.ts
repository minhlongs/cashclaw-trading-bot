// Bot Strategy — strategy initialization and chain evaluation
// Standalone functions extracted from BotInstance for size compliance.

import type {
  OrderRequest,
  OrderResult,
} from '../exchange/types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- BotConfig used in line 54 type assertion; StrategyContext used in line 75 build context
import type {
  BotTrade,
  BotConfig,
  StrategyContext,
  GridBotConfig,
  MeanRevBotConfig,
} from './types';
import { type StrategyChain, buildDefaultChain } from './strategy-chain';
import { GridStrategy } from './strategies/grid';
import { MeanRevStrategy } from './strategies/mean-reversion';

export interface StrategyBundle {
  strategy: GridStrategy | MeanRevStrategy;
  strategyChain: StrategyChain | null;
}

export function initializeStrategy(params: {
  config: GridBotConfig | MeanRevBotConfig;
  price: number;
  botId: string;
  placeOrder: (req: OrderRequest) => Promise<OrderResult>;
  onTrade: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
}): StrategyBundle {
  const { config, price, botId, placeOrder, onTrade, onLog } = params;
  let strategyChain: StrategyChain | null = null;

  if (config.strategyChain) {
    strategyChain = buildDefaultChain(config);
  }

  const onLogWithId = (msg: string) => onLog(`[${botId}] ${msg}`);
  let strategy: GridStrategy | MeanRevStrategy;

  switch (config.strategy) {
    case 'grid': {
      const gridConfig = config as GridBotConfig;
      strategy = new GridStrategy(gridConfig, { placeOrder, onTrade, onLog: onLogWithId });
      strategy.start(price);
      break;
    }
    case 'mean_reversion': {
      const mrConfig = config as MeanRevBotConfig;
      strategy = new MeanRevStrategy(mrConfig, { placeOrder, onTrade, onLog: onLogWithId });
      strategy.start(price);
      break;
    }
    default:
      throw new Error(`Unknown strategy: ${(config as BotConfig).strategy}`);
  }

  return { strategy, strategyChain };
}

export function evaluateChain(params: {
  config: GridBotConfig | MeanRevBotConfig;
  strategyChain: StrategyChain | null;
  totalPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  price: number;
}): OrderRequest | null {
  const { config, strategyChain, totalPnl, totalTrades, winCount, lossCount, price } = params;

  if (!strategyChain || strategyChain.length === 0) {
    return null;
  }

  const ctx: StrategyContext = {
    symbol: config.symbol,
    balance: config.capital + totalPnl,
    openPositions: totalTrades - winCount - lossCount,
    lastPrice: price,
  };

  for (const node of strategyChain) {
    const signal = node.strategy.evaluate(ctx);
    if (signal) {
      return {
        symbol: config.symbol,
        side: signal.side,
        type: 'market',
        quantity: signal.qty,
      };
    }
  }

  return null;
}
