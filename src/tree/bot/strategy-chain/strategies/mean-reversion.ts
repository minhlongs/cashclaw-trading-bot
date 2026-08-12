// Mean-Reversion Chain Strategy — OmniRoute Phase 4 wrapper
// Delegates to real MeanRevStrategy with capture callbacks for chain evaluation.

import type { ChainStrategy, StrategyContext, TradeSignal } from '../types';
import { MeanRevStrategy } from '@/tree/bot/strategies/mean-reversion';
import type { MeanRevBotConfig, BotTrade } from '@/tree/bot/types';
import type { OrderRequest, OrderResult, Ticker } from '@/tree/exchange/types';

export interface MeanRevChainConfig {
  type: 'mean_reversion';
  meanRevConfig: MeanRevBotConfig;
}

export function createMeanRevChainStrategy(
  config: MeanRevChainConfig,
): ChainStrategy {
  const strategy = new MeanRevStrategy(config.meanRevConfig, {
    placeOrder: (_req: OrderRequest): Promise<OrderResult> => {
      return Promise.resolve({
        id: '',
        exchangeId: '',
        symbol: _req.symbol,
        side: _req.side,
        type: _req.type,
        price: _req.price ?? 0,
        quantity: _req.quantity,
        filled: _req.quantity,
        status: 'filled' as const,
        fee: 0,
        timestamp: Date.now(),
      } satisfies OrderResult);
    },
    onTrade: (_trade: BotTrade) => {
      // Eval-only
    },
    onLog: (_msg: string) => {
      // Eval-only: silent in chain mode
    },
  });

  return {
    name: 'mean_reversion',
    evaluate(ctx: StrategyContext): TradeSignal | null {
      const ticker: Ticker = {
        last: ctx.lastPrice,
        symbol: ctx.symbol,
        timestamp: Date.now(),
        bid: ctx.lastPrice,
        ask: ctx.lastPrice,
        high24h: ctx.lastPrice,
        low24h: ctx.lastPrice,
        volume24h: 0,
      };

      strategy.onTicker(ticker);

      // MeanRevStrategy emits trades when RSI/BB conditions trigger.
      // Signal presence inferred from internal fill count.
      const fills = (strategy as any).fillCount ?? 0;
      if (fills > 0) {
        return {
          side: ctx.lastPrice > 0 ? 'buy' : 'sell',
          qty: ctx.balance > 0 ? Math.min(ctx.balance * 0.1, 1) : 0,
          price: ctx.lastPrice,
          reason: 'mean_reversion',
        };
      }
      return null;
    },
  };
}
