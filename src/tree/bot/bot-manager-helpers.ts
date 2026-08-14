// Bot Manager helpers — D1 persistence callbacks
// Extracted from BotManager.createBot() for size compliance.

import type { BotConfig, BotState, BotTrade } from './types';
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
