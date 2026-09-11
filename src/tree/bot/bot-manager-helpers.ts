// Bot Manager helpers — D1 persistence callbacks
// Extracted from BotManager.createBot() for size compliance.

import type { BotConfig, BotState, BotTrade, VolatilityDcaBotConfig } from './types';
import type { BotCallbacks } from './bot-instance';
import { persistBot, patchBot } from '@/forest/bot/d1-adapter';
import type { TradeEventType } from '../telemetry/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('bot-manager');

type D1BotStatus = 'draft' | 'paper_test' | 'live_running' | 'paused' | 'error' | 'stopped';

function toD1Status(status: string): D1BotStatus {
  switch (status) {
    case 'running': return 'paper_test';
    case 'paused': return 'paused';
    case 'stopped': return 'stopped';
    case 'error': return 'error';
    default: return 'draft';
  }
}

export interface D1CallbackDeps {
  botId: string;
  userId: string;
  config: BotConfig;
  capital: number;
  onLog: (msg: string) => void;
  onError: (error: Error, context: string) => void;
  onBotEvent?: (botId: string, event: string, data: Record<string, unknown>) => void;
  emitTelemetry?: (type: TradeEventType, details: Record<string, unknown>) => void;
}

export function createD1Callbacks(deps: D1CallbackDeps): BotCallbacks {
  return {
    onStateChange: (state: BotState) => {
      patchBot(deps.botId, {
        status: toD1Status(state.status),
        total_pnl: state.totalPnl,
        win_count: state.winCount,
        loss_count: state.lossCount,
        max_drawdown: state.maxDrawdown,
        total_trades: state.totalTrades,
        started_at: state.startedAt,
        stopped_at: state.stoppedAt,
        last_tick_at: state.lastTickAt,
        last_order_at: state.lastOrderAt,
        last_error: state.error,
      }).catch((error) => {
        log.error(`D1 persist state failed for ${deps.botId}`, error instanceof Error ? error : new Error(String(error)), { action: 'patchBot:state' });
      });
    },
    onTrade: (trade: BotTrade) => {
      // Log trade for observability; persistence handled by bot-instance
      deps.onLog(`Trade: ${trade.side} ${trade.symbol} @ ${trade.price} pnl=${trade.pnl}`);
    },
    onLog: deps.onLog,
    onError: deps.onError,
  };
}

/**
 * Builds a minimal valid BotConfig from a D1 row when the stored config_json
 * is unparseable. Used only as a last-resort fallback so hydration never throws.
 */
export function defaultConfigFromRow(row: { name: string; pair: string; exchange: string; strategy: string; capital_allocated: number }): BotConfig {
  const base = {
    name: row.name,
    symbol: row.pair,
    exchange: row.exchange,
    mode: 'paper' as const,
    capital: row.capital_allocated,
    maxDrawdownPct: 15,
  };
  if (row.strategy === 'mean_reversion') {
    return {
      ...base,
      strategy: 'mean_reversion' as const,
      bbPeriod: 20,
      bbStdDev: 2,
      rsiPeriod: 14,
      rsiBuyThreshold: 30,
      rsiSellThreshold: 70,
      volumeMultiplier: 1,
      positionSizePct: 10,
      cooldownMinutes: 5,
    };
  }
  if (row.strategy === 'volatility_dca') {
    return {
      ...base,
      strategy: 'volatility_dca' as const,
      pair: row.pair,
      priceDropStep: 1.5,
      maxSteps: 6,
      baseOrderSizePct: 10,
      volatilityWindow: 20,
      volBaseline: 50,
      reboundTarget: 1.0,
    } satisfies VolatilityDcaBotConfig;
  }
  return {
    ...base,
    strategy: 'grid' as const,
    gridSpacingPct: 0.5,
    gridLevels: 5,
    capitalPerLevelPct: 20,
    takeProfitPct: 1,
    stopLossPct: 1,
    rebalanceOnFill: false,
  };
}

/**
 * Persists a newly created bot to D1.
 */
export async function persistNewBot(deps: D1CallbackDeps): Promise<void> {
  persistBot(deps.userId, {
    id: deps.botId,
    config: deps.config,
    capital: deps.capital,
    name: deps.botId,
    strategy: deps.config.strategy,
    pair: deps.config.symbol,
    exchange: deps.config.exchange,
  });
}
