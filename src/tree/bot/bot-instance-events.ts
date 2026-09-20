// Bot Instance Events — state emission, telemetry dispatching, teardown,
// context factories, and tick loop helpers extracted from BotInstance.

import type { OrderRequest, OrderResult } from '../exchange/types';
import type { BotState, BotTrade, BotDependencies, BotCallbacks, BotConfig } from './types';
import type { StrategyChain } from './strategy-chain';
import type { GridStrategy } from './strategies/grid';
import type { MeanRevStrategy } from './strategies/mean-reversion';
import type { VolatilityDcaStrategy } from './strategies/volatility-dca';
import type { TradeEventType } from '../telemetry/types';
import type { TickContext } from './bot-tick';
import type { OrderContext } from './bot-order-executor';
import type { StartLifecycleContext } from './bot-instance-lifecycle';

export function emitBotStateChange(callbacks: BotCallbacks, getState: () => BotState): void {
  callbacks.onStateChange(getState());
}

export function emitBotTelemetry(
  deps: BotDependencies,
  botId: string,
  eventType: TradeEventType,
  details: Record<string, unknown> = {},
): void {
  deps.telemetry?.emit(botId, eventType, details);
}

export function destroyBotInstance(botId: string, stop: () => void, deps: BotDependencies): void {
  stop();
  deps.killswitch.unregisterBot(botId);
}

export function buildTickContext(
  id: string, config: BotConfig, deps: BotDependencies, callbacks: BotCallbacks,
  state: BotState, strategy: GridStrategy | MeanRevStrategy | VolatilityDcaStrategy | null,
  strategyChain: StrategyChain | null, lastTickPrice: number | null,
  placeOrder: (req: OrderRequest) => Promise<OrderResult>, pause: () => void,
  emitTelemetry: (type: TradeEventType, details: Record<string, unknown>) => void,
  emitState: () => void,
): TickContext {
  return { id, config, deps, callbacks, state, strategy, strategyChain, lastTickPrice, placeOrder, pause, emitTelemetry, emitState };
}

export function buildOrderContext(
  deps: BotDependencies, config: BotConfig, state: BotState, botId: string,
  onTrade: (trade: BotTrade) => void,
  emitTelemetry: (type: TradeEventType, details: Record<string, unknown>) => void,
  emitState: () => void,
): OrderContext {
  return { deps, config: { capital: config.capital, symbol: config.symbol }, state, botId, onTrade, emitTelemetry, emitState };
}

export function buildLifecycleContext(
  id: string, config: BotConfig, deps: BotDependencies, callbacks: BotCallbacks,
  state: BotState, placeOrder: (req: OrderRequest) => Promise<OrderResult>,
  emitTelemetry: (type: TradeEventType, details?: Record<string, unknown>) => void,
  emitState: () => void, startTicking: () => void,
): StartLifecycleContext {
  return { id, config, deps, callbacks, state, placeOrder, emitTelemetry, emitState, startTicking };
}

export function startBotTicking(interval: ReturnType<typeof setInterval> | null, tick: () => void): ReturnType<typeof setInterval> {
  if (interval) clearInterval(interval);
  return setInterval(tick, 1000);
}

export function stopBotTicking(interval: ReturnType<typeof setInterval> | null): null {
  if (interval) clearInterval(interval);
  return null;
}
