import type { OrderRequest, OrderResult } from '../exchange/types';
import {
  type BotTrade,
  type BotConfig,
  type StrategyContext,
  type GridBotConfig,
  type MeanRevBotConfig,
  type VolatilityDcaBotConfig,
  type H3MakerBotConfig,
  isH3MakerConfig,
} from './types';
import { type StrategyChain, buildDefaultChain } from './strategy-chain';
import { GridStrategy } from './strategies/grid';
import { MeanRevStrategy } from './strategies/mean-reversion';
import { VolatilityDcaStrategy } from './strategies/volatility-dca';
import { H3MakerStrategy } from './strategies/h3-maker';

export interface StrategyBundle {
  strategy: GridStrategy | MeanRevStrategy | VolatilityDcaStrategy;
  strategyChain: StrategyChain | null;
}

export function initializeStrategy(params: {
  config: BotConfig;
  price: number;
  botId: string;
  placeOrder: (req: OrderRequest) => Promise<OrderResult>;
  cancelOrder?: (orderId: string, symbol?: string) => Promise<boolean>;
  getPositionSnapshot?: () => { qty: number; entryPrice: number } | null;
  onTrade: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
}): StrategyBundle {
  const { config, price, botId, placeOrder, cancelOrder, getPositionSnapshot, onTrade, onLog } = params;
  let strategyChain: StrategyChain | null = null;

  if (config.strategyChain) {
    strategyChain = buildDefaultChain(config);
  }

  const onLogWithId = (msg: string) => onLog(`[${botId}] ${msg}`);
  let strategy: GridStrategy | MeanRevStrategy | VolatilityDcaStrategy;

  if (isH3MakerConfig(config)) {
    const h3 = new H3MakerStrategy(
      config satisfies H3MakerBotConfig,
      { placeOrder, cancelOrder, getPositionSnapshot, onLog: onLogWithId },
      botId,
    );
    h3.start(price);
    // H3MakerStrategy satisfies { start, stop, onTicker } used by BotInstance/tick;
    // cast avoids editing Stream-1 nominal class unions in bot-tick / bot-instance-ops.
    strategy = h3 as unknown as VolatilityDcaStrategy;
    return { strategy, strategyChain };
  }

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
    case 'volatility_dca': {
      const vdConfig = config as VolatilityDcaBotConfig;
      strategy = new VolatilityDcaStrategy(vdConfig, { placeOrder, onTrade, onLog: onLogWithId });
      strategy.start(price);
      break;
    }
    default:
      throw new Error(`Unknown strategy: ${(config as BotConfig).strategy}`);
  }

  return { strategy, strategyChain };
}

export function evaluateChain(params: {
  config: BotConfig;
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
      return { symbol: config.symbol, side: signal.side, type: 'market', quantity: signal.qty };
    }
  }
  return null;
}
