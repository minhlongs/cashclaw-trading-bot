// Bot Tick — single evaluation cycle (extracted from BotInstance for size compliance)
// Runs each tick: fetch price, evaluate chain, delegate to strategy, emit events.

import type { OrderRequest } from '../exchange/types';
import type { BotConfig, BotCallbacks, BotDependencies, BotState } from './types';
import { evaluateChain } from './bot-strategy';
import { GridStrategy } from './strategies/grid';
import { MeanRevStrategy } from './strategies/mean-reversion';
import { VolatilityDcaStrategy } from './strategies/volatility-dca';
import type { StrategyChain } from './strategy-chain';
import type { TradeEventType } from '../telemetry/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import { computeRegimeContext } from '@/tree/regime/bot-context';

export interface TickContext {
  id: string;
  config: BotConfig;
  deps: BotDependencies;
  callbacks: BotCallbacks;
  state: BotState;
  strategy: GridStrategy | MeanRevStrategy | VolatilityDcaStrategy | null;
  strategyChain: StrategyChain | null;
  lastTickPrice: number | null;
  lastTickTimestampMs?: number | null;
  placeOrder: (req: OrderRequest) => Promise<import('../exchange/types').OrderResult>;
  pause: () => void;
  emitTelemetry: (eventType: TradeEventType, details: Record<string, unknown>) => void;
  emitState: () => void;
  recentCandles?: Candle[];
}

export interface TickResult {
  lastTickPrice: number | null;
  lastTickTimestampMs?: number | null;
}

export async function tick(ctx: TickContext): Promise<TickResult> {
  const {
    id, config, deps, callbacks, state,
    strategy, strategyChain, placeOrder, pause, emitTelemetry, emitState,
    recentCandles = [],
  } = ctx;

  let lastTickPrice = ctx.lastTickPrice;
  let lastTickTimestampMs = ctx.lastTickTimestampMs ?? null;

  if (state.status !== 'running') return { lastTickPrice, lastTickTimestampMs };
  if (!deps.killswitch.isTradingEnabled()) {
    callbacks.onLog(`Bot ${id} halted by killswitch: ${deps.killswitch.haltReason}`);
    pause();
    return { lastTickPrice, lastTickTimestampMs };
  }

  try {
    let ticker;
    if (deps.exchangeOrchestrator) {
      const r = await deps.exchangeOrchestrator.fetchTicker('paper', config.symbol);
      ticker = r.ok ? r.data : undefined;
    } else {
      ticker = await deps.exchange.fetchTicker(config.symbol);
    }
    if (!ticker) {
      throw new Error(`Failed to fetch ticker for ${config.symbol}`);
    }
    const price = ticker.last;
    if (price <= 0) return { lastTickPrice, lastTickTimestampMs };

    const nowMs = Date.now();
    const rawTs = ticker.timestamp;
    const effectiveTickTs = Number.isFinite(rawTs) && rawTs > 0 ? rawTs : nowMs;
    lastTickPrice = price;
    lastTickTimestampMs = effectiveTickTs;
    state.lastTickAt = nowMs;
    state.updatedAt = nowMs;

    if (nowMs - effectiveTickTs > 15_000) {
      emitTelemetry('error', {
        error: `Stale market ticker ageMs=${nowMs - effectiveTickTs} exceeds 15000ms fence`,
        action: 'STALE_DATA_FAIL_CLOSED',
        context: 'bot.tick',
      });
      emitState();
      return { lastTickPrice, lastTickTimestampMs };
    }

    const regimeCtx = computeRegimeContext(config.symbol, recentCandles);

    const chainOrder = evaluateChain({
      config, strategyChain, totalPnl: state.totalPnl, totalTrades: state.totalTrades,
      winCount: state.winCount, lossCount: state.lossCount, price,
    });
    if (chainOrder) {
      callbacks.onLog(`[${id}] Chain signal: ${chainOrder.side} ${chainOrder.quantity} @ market`);
      try {
        await placeOrder(chainOrder);
      } catch (error) {
        emitTelemetry('error', { error: error instanceof Error ? error.message : 'unknown', context: 'bot.chainOrder' });
      }
    }
    if (strategy) strategy.onTicker(ticker);

    emitTelemetry('tick', {
      price,
      pnl: state.totalPnl,
      ...(regimeCtx ? { entryRegime: { label: regimeCtx.label, confidence: regimeCtx.confidence } } : {}),
    });
    emitState();
  } catch (error) {
    emitTelemetry('error', { error: error instanceof Error ? error.message : 'unknown', context: 'bot.tick' });
    callbacks.onError(error instanceof Error ? error : new Error(String(error)), 'bot.tick');
  }

  return { lastTickPrice, lastTickTimestampMs };
}
