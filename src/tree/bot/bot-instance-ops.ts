import type { OrderRequest, OrderResult } from '../exchange/types';
import type { BotState, BotConfig, BotDependencies, BotCallbacks } from './types';
import type { StrategyChain } from './strategy-chain';
import type { GridStrategy } from './strategies/grid';
import type { MeanRevStrategy } from './strategies/mean-reversion';
import type { VolatilityDcaStrategy } from './strategies/volatility-dca';
import type { TradeEventType } from '../telemetry/types';
import { executeOrder as execOrder } from './bot-order-executor';
import { tick as execTick } from './bot-tick';
import { startBotLifecycle } from './bot-instance-lifecycle';
import { buildTickContext, buildOrderContext, buildLifecycleContext } from './bot-instance-events';
export type BotStrategy = GridStrategy | MeanRevStrategy | VolatilityDcaStrategy | null;

export async function executeBotStart(
  id: string, config: BotConfig, deps: BotDependencies, callbacks: BotCallbacks, state: BotState,
  placeOrder: (r: OrderRequest) => Promise<OrderResult>, emitTelem: (t: TradeEventType, d?: Record<string, unknown>) => void,
  emitSt: () => void, startTick: () => void,
): Promise<{ strategy: BotStrategy; strategyChain: StrategyChain | null }> {
  return startBotLifecycle(buildLifecycleContext(id, config, deps, callbacks, state, placeOrder, emitTelem, emitSt, startTick));
}
export async function executeBotTick(
  id: string, config: BotConfig, deps: BotDependencies, callbacks: BotCallbacks, state: BotState,
  strat: BotStrategy, chain: StrategyChain | null, lastPrice: number | null,
  placeOrder: (r: OrderRequest) => Promise<OrderResult>, pause: () => void,
  emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void,
): Promise<number | null> {
  return (await execTick(buildTickContext(id, config, deps, callbacks, state, strat, chain, lastPrice, placeOrder, pause, emitTelem, emitSt))).lastTickPrice;
}
export async function executeBotOrder(
  id: string, config: BotConfig, deps: BotDependencies, callbacks: BotCallbacks, state: BotState,
  counter: number, req: OrderRequest, emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void,
): Promise<{ result: OrderResult; counter: number }> {
  if (!deps.killswitch.isTradingEnabled()) throw new Error('Trading halted by killswitch');
  const { result, orderCounter } = await execOrder(buildOrderContext(deps, config, state, id, (t) => callbacks.onTrade(t), emitTelem, emitSt), req, counter);
  return { result, counter: orderCounter };
}
