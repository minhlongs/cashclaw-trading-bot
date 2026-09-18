// Bot Instance Lifecycle — price resolution and start lifecycle management
// Extracted from BotInstance for file size compliance.

import type { OrderRequest, OrderResult } from '../exchange/types';
import type { BotState, BotTrade, BotConfig, BotCallbacks, BotDependencies } from './types';
import type { StrategyChain } from './strategy-chain';
import type { GridStrategy } from './strategies/grid';
import type { MeanRevStrategy } from './strategies/mean-reversion';
import type { VolatilityDcaStrategy } from './strategies/volatility-dca';
import type { TradeEventType } from '../telemetry/types';
import { initializeStrategy } from './bot-strategy';

export interface StartLifecycleContext {
  id: string;
  config: BotConfig;
  deps: BotDependencies;
  callbacks: BotCallbacks;
  state: BotState;
  placeOrder: (req: OrderRequest) => Promise<OrderResult>;
  emitTelemetry: (type: TradeEventType, details?: Record<string, unknown>) => void;
  emitState: () => void;
  startTicking: () => void;
}

export interface StartLifecycleResult {
  strategy: GridStrategy | MeanRevStrategy | VolatilityDcaStrategy | null;
  strategyChain: StrategyChain | null;
}

/**
 * Fetch and validate starting price from exchange orchestrator or exchange adapter.
 */
export async function fetchStartPrice(deps: BotDependencies, symbol: string): Promise<number> {
  let ticker;
  if (deps.exchangeOrchestrator) {
    const r = await deps.exchangeOrchestrator.fetchTicker('paper', symbol);
    ticker = r.ok ? r.data : undefined;
  } else {
    ticker = await deps.exchange.fetchTicker(symbol);
  }
  if (!ticker) {
    throw new Error(`Failed to fetch ticker for ${symbol}`);
  }
  const price = ticker.last;
  if (price <= 0) {
    throw new Error(`Invalid price for ${symbol}: ${price}`);
  }
  return price;
}

/**
 * Execute start lifecycle: fetch price, initialize strategy, emit telemetry/state, and start ticks.
 */
export async function startBotLifecycle(ctx: StartLifecycleContext): Promise<StartLifecycleResult> {
  const { id, config, deps, callbacks, state, placeOrder, emitTelemetry, emitState, startTicking } = ctx;

  if (state.status === 'running') {
    return { strategy: null, strategyChain: null };
  }

  try {
    const price = await fetchStartPrice(deps, config.symbol);
    const bundle = initializeStrategy({
      config,
      price,
      botId: id,
      placeOrder,
      onTrade: (trade: BotTrade) => callbacks.onTrade(trade),
      onLog: (msg: string) => callbacks.onLog(`[${id}] ${msg}`),
    });

    state.status = 'running';
    state.startedAt = state.updatedAt = Date.now();
    emitTelemetry('start', { strategy: config.strategy, symbol: config.symbol, price });
    emitState();
    startTicking();
    callbacks.onLog(`Bot ${id} started (${config.strategy}) @ ${price.toFixed(2)}`);

    return { strategy: bundle.strategy, strategyChain: bundle.strategyChain };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    state.status = 'error';
    state.error = msg;
    state.updatedAt = Date.now();
    emitTelemetry('error', { error: msg, context: 'bot.start' });
    emitState();
    callbacks.onError(error instanceof Error ? error : new Error(String(error)), 'bot.start');

    return { strategy: null, strategyChain: null };
  }
}
