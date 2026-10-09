import type { BotState, BotTrade } from './types';
import type { BotCallbacks } from './bot-instance';
import { patchBot } from '@/forest/bot/d1-adapter';
import { createLogger } from '@/lib/logger';
import { toD1Status, type D1CallbackDeps } from './bot-manager-d1-status';

export type { D1CallbackDeps } from './bot-manager-d1-status';
export { persistNewBot } from './bot-manager-d1-status';
export { defaultConfigFromRow } from './bot-manager-default-config';

const log = createLogger('bot-manager');

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
      deps.onLog(`Trade: ${trade.side} ${trade.symbol} @ ${trade.price} pnl=${trade.pnl}`);
    },
    onLog: deps.onLog,
    onError: deps.onError,
  };
}
