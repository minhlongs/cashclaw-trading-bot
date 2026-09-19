/**
 * Bot Query Service — Row Mapper
 * Pure transformation from D1 row to BotSummary.
 */

import type { BotConfig } from '@/tree/bot/types';
import { toBotStatus } from '@/forest/bot/d1-hydration';
import type { BotRow, BotSummary } from './bot-query-service-types';

export function rowToBotSummary(row: BotRow): BotSummary {
  const config = JSON.parse(row.config_json) as BotConfig;
  return {
    id: row.id,
    name: row.name,
    status: toBotStatus(row.status),
    pair: config.symbol,
    strategy: config.strategy,
    exchange: config.exchange ?? 'paper',
    mode: config.mode ?? 'paper',
    config,
    metrics: {
      totalPnl: row.total_pnl,
      winCount: row.win_count,
      lossCount: row.loss_count,
      maxDrawdown: row.max_drawdown,
      currentDrawdown: row.current_drawdown,
      totalTrades: row.total_trades,
      startedAt: row.started_at,
      stoppedAt: row.stopped_at,
      lastTickAt: row.last_tick_at,
      lastOrderAt: row.last_order_at,
      lastError: row.last_error,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
