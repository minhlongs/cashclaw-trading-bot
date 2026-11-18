// Bot Instance Lifecycle — price resolution and start lifecycle management
// Extracted from BotInstance for file size compliance.

import type { OrderRequest, OrderResult } from '../exchange/types';
import type { BotState, BotTrade, BotConfig, BotCallbacks, BotDependencies } from './types';
import type { StrategyChain } from './strategy-chain';
import type { GridStrategy } from './strategies/grid';
import type { MeanRevStrategy } from './strategies/mean-reversion';
import type { VolatilityDcaStrategy } from './strategies/volatility-dca';
import type { TradeEventType } from '../telemetry/types';
import { BASE_UNITS_PER_ASSET, MICRO_USD_PER_USD, ZERO_BIGINT } from '../ledger';
import { cancelLifecycleOrder, ensureDurableBotHydrated } from './bot-order-lifecycle-bridge';
import { buildOrderContext } from './bot-instance-events';
import { initializeStrategy } from './bot-strategy';

export interface StartLifecycleContext {
  id: string;
  config: BotConfig;
  deps: BotDependencies;
  callbacks: BotCallbacks;
  state: BotState;
  hasStrategy?: boolean;
  placeOrder: (req: OrderRequest) => Promise<OrderResult>;
  emitTelemetry: (type: TradeEventType, details?: Record<string, unknown>) => void;
  emitState: () => void;
  startTicking: () => void;
}

export interface StartLifecycleResult {
  strategy: GridStrategy | MeanRevStrategy | VolatilityDcaStrategy | null;
  strategyChain: StrategyChain | null;
  initialPrice?: number;
  initialTimestampMs?: number;
}

async function fetchStartTickerSample(
  deps: BotDependencies,
  symbol: string,
): Promise<{ price: number; timestampMs: number }> {
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
  const timestampMs = Number.isFinite(ticker.timestamp) && ticker.timestamp > 0 ? ticker.timestamp : Date.now();
  return { price, timestampMs };
}

export async function fetchStartPrice(deps: BotDependencies, symbol: string): Promise<number> {
  return (await fetchStartTickerSample(deps, symbol)).price;
}

export async function executeStrategyCancelOrder(
  deps: BotDependencies,
  config: BotConfig,
  orderCtx: ReturnType<typeof buildOrderContext>,
  orderId: string,
  symbol?: string,
): Promise<boolean> {
  const targetSym = symbol ?? config.symbol;
  let cancelled = false;
  if (deps.exchangeOrchestrator && typeof deps.exchangeOrchestrator.cancelOrder === 'function') {
    const res = await deps.exchangeOrchestrator.cancelOrder(config.exchange ?? 'paper', orderId, targetSym);
    cancelled = res.ok ? Boolean(res.data) : false;
  } else {
    cancelled = Boolean(await deps.exchange.cancelOrder(orderId, targetSym));
  }
  if (deps.lifecycleEngine) {
    await cancelLifecycleOrder(orderCtx, deps.lifecycleEngine, orderId);
  }
  return cancelled;
}

export async function startBotLifecycle(ctx: StartLifecycleContext): Promise<StartLifecycleResult> {
  const { id, config, deps, callbacks, state, hasStrategy = true, placeOrder, emitTelemetry, emitState, startTicking } = ctx;

  if (state.status === 'running' && hasStrategy) {
    return { strategy: null, strategyChain: null };
  }

  try {
    const orderCtx = buildOrderContext(deps, config, state, id, (t) => callbacks.onTrade(t), emitTelemetry, emitState);
    await ensureDurableBotHydrated(orderCtx);
    const { price, timestampMs } = await fetchStartTickerSample(deps, config.symbol);
    const getPositionSnapshot = () => {
      const pos = deps.lifecycleEngine?.getLedger().getPosition(config.symbol);
      if (!pos || pos.signedQtyBase <= ZERO_BIGINT) return null;
      const qty = Number(pos.signedQtyBase) / Number(BASE_UNITS_PER_ASSET);
      const entryPrice = Number(pos.openNotionalMicroUsd) / Number(MICRO_USD_PER_USD) / qty;
      return { qty, entryPrice };
    };
    const bundle = initializeStrategy({
      config,
      price,
      botId: id,
      placeOrder,
      cancelOrder: (orderId, sym) => executeStrategyCancelOrder(deps, config, orderCtx, orderId, sym),
      getPositionSnapshot,
      onTrade: (trade: BotTrade) => callbacks.onTrade(trade),
      onLog: (msg: string) => callbacks.onLog(`[${id}] ${msg}`),
    });

    const wasAlreadyRunning = state.status === 'running';
    const now = Date.now();
    state.status = 'running';
    state.startedAt = wasAlreadyRunning && state.startedAt ? state.startedAt : now;
    state.updatedAt = now;
    emitTelemetry('start', { strategy: config.strategy, symbol: config.symbol, price });
    emitState();
    startTicking();
    callbacks.onLog(`Bot ${id} started (${config.strategy}) @ ${price.toFixed(2)}`);

    return {
      strategy: bundle.strategy,
      strategyChain: bundle.strategyChain,
      initialPrice: price,
      initialTimestampMs: timestampMs,
    };
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
