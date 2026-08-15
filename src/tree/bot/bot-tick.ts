// Bot Tick — single evaluation cycle (extracted from BotInstance for size compliance)
// Runs each tick: fetch price, evaluate chain, delegate to strategy, emit events.

import type {
  OrderRequest,
} from '../exchange/types';
import type {
  GridBotConfig,
  MeanRevBotConfig,
  BotCallbacks,
  BotDependencies,
  BotState,
} from './types';
import type { StrategyChain } from './strategy-chain';
import { GridStrategy } from './strategies/grid';
import { MeanRevStrategy } from './strategies/mean-reversion';
import type { TradeEventType } from '../telemetry/types';
import { evaluateChain } from './bot-strategy';

export interface TickContext {
  id: string;
  config: GridBotConfig | MeanRevBotConfig;
  deps: BotDependencies;
  callbacks: BotCallbacks;
  state: BotState;
  strategy: GridStrategy | MeanRevStrategy | null;
  strategyChain: StrategyChain | null;
  lastTickPrice: number | null;
  placeOrder: (req: OrderRequest) => Promise<import('../exchange/types').OrderResult>;
  pause: () => void;
  emitTelemetry: (eventType: TradeEventType, details: Record<string, unknown>) => void;
  emitState: () => void;
}

export interface TickResult {
  lastTickPrice: number | null;
}

export async function tick(ctx: TickContext): Promise<TickResult> {
  const {
    id, config, deps, callbacks, state,
    strategy, strategyChain, placeOrder, pause, emitTelemetry, emitState,
  } = ctx;

  let lastTickPrice = ctx.lastTickPrice;

  if (state.status !== 'running') return { lastTickPrice };
  if (!deps.killswitch.isTradingEnabled()) {
    callbacks.onLog(`Bot ${id} halted by killswitch: ${deps.killswitch.haltReason}`);
    pause();
    return { lastTickPrice };
  }

  try {
    const ticker = await deps.exchange.fetchTicker(config.symbol);
    const price = ticker.last;
    if (price <= 0) return { lastTickPrice };

    lastTickPrice = price;
    state.lastTickAt = Date.now();
    state.updatedAt = Date.now();

    const chainOrder = evaluateChain({
      config,
      strategyChain,
      totalPnl: state.totalPnl,
      totalTrades: state.totalTrades,
      winCount: state.winCount,
      lossCount: state.lossCount,
      price,
    });
    if (chainOrder) {
      callbacks.onLog(`[${id}] Chain signal: ${chainOrder.side} ${chainOrder.quantity} @ market`);
      try {
        await placeOrder(chainOrder);
      } catch (error) {
        emitTelemetry('error', { error: error instanceof Error ? error.message : 'unknown', context: 'bot.chainOrder' });
      }
    }

    if (strategy) {
      strategy.onTicker(ticker);
    }

    emitTelemetry('tick', { price, pnl: state.totalPnl });
    emitState();
  } catch (error) {
    emitTelemetry('error', { error: error instanceof Error ? error.message : 'unknown', context: 'bot.tick' });
    callbacks.onError(error instanceof Error ? error : new Error(String(error)), 'bot.tick');
  }

  return { lastTickPrice };
}
