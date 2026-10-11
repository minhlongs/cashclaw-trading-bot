import type { BotState, BotConfig, BotCallbacks, BotDependencies } from './types';
import type { StrategyChain } from './strategy-chain';
import type { OrderRequest, OrderResult } from '../exchange/types';
import type { TradeEventType } from '../telemetry/types';
import { executeBotStart, executeBotTick, executeBotOrder, type BotStrategy } from './bot-instance-ops';

export interface BotContext {
  id: string; config: BotConfig; deps: BotDependencies; callbacks: BotCallbacks; state: BotState;
  strategy: BotStrategy; strategyChain: StrategyChain | null; lastTickPrice: number | null; orderCounter: number;
}

export async function runBotStart(ctx: BotContext, placeOrder: (r: OrderRequest) => Promise<OrderResult>, emitTelem: (t: TradeEventType, d?: Record<string, unknown>) => void, emitSt: () => void, startTick: () => void): Promise<void> {
  const res = await executeBotStart(ctx.id, ctx.config, ctx.deps, ctx.callbacks, ctx.state, placeOrder, emitTelem, emitSt, startTick);
  if (res.strategy) { ctx.strategy = res.strategy; ctx.strategyChain = res.strategyChain; }
}

export async function runBotTick(ctx: BotContext, placeOrder: (r: OrderRequest) => Promise<OrderResult>, pause: () => void, emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void): Promise<void> {
  ctx.lastTickPrice = await executeBotTick(ctx.id, ctx.config, ctx.deps, ctx.callbacks, ctx.state, ctx.strategy, ctx.strategyChain, ctx.lastTickPrice, placeOrder, pause, emitTelem, emitSt);
}

export async function runBotOrder(ctx: BotContext, req: OrderRequest, emitTelem: (t: TradeEventType, d: Record<string, unknown>) => void, emitSt: () => void): Promise<OrderResult> {
  const { result, counter } = await executeBotOrder(ctx.id, ctx.config, ctx.deps, ctx.callbacks, ctx.state, ctx.orderCounter, req, emitTelem, emitSt);
  ctx.orderCounter = counter; return result;
}
