/**
 * D1 Hydration — Status Mapper & State Restoration
 * Shared utilities used by both BotQueryService (read path) and
 * BotManager lazy hydration (write path).
 */

import type { BotState, BotStatus } from '@/tree/bot/types';

/**
 * Reverse-map a D1 `bots.status` column value to a runtime BotStatus.
 *
 * The D1 schema stores a 6-value enum (`draft`/`paper_test`/`live_running`/
 * `paused`/`error`/`stopped`) that is not identical to the runtime
 * `BotStatus` union (`idle`/`running`/`paused`/`stopped`/`error`). Without
 * this mapping every hydrated bot came back as `idle` regardless of its
 * persisted state — a bot that was paused before cold start looked like a
 * fresh draft bot on the next request.
 */
export function toBotStatus(d1Status: string): BotStatus {
  switch (d1Status) {
    case 'paper_test':
    case 'live_running':
      return 'running';
    case 'paused':
      return 'paused';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    case 'draft':
    default:
      return 'idle';
  }
}

export interface BotHydrateRow {
  status: string;
  total_trades: number;
  started_at: number | null;
  stopped_at: number | null;
  last_error: string | null;
  last_tick_at: number | null;
  last_order_at: number | null;
  current_drawdown: number;
  total_pnl: number;
  win_count: number;
  loss_count: number;
  max_drawdown: number;
}

/**
 * Restore BotInstance state from a D1 database row.
 * Shared by hydrateFromD1 and BotManager lazy hydration.
 *
 * Accepts any object with getSnapshot/patchState.
 */
export function restoreBotStateFromRow(
  bot: { getSnapshot: () => BotState; patchState: (patch: Partial<BotState>) => void },
  row: BotHydrateRow,
): void {
  const patch: Partial<BotState> = {};

  if (row.status !== null && row.status !== undefined) {
    patch.status = toBotStatus(row.status);
  }
  if (row.total_trades !== null) patch.totalTrades = row.total_trades;
  if (row.started_at !== null) patch.startedAt = row.started_at;
  if (row.stopped_at !== null) patch.stoppedAt = row.stopped_at;
  if (row.last_tick_at !== null) patch.lastTickAt = row.last_tick_at;
  if (row.last_order_at !== null) patch.lastOrderAt = row.last_order_at;
  if (row.current_drawdown !== null) patch.currentDrawdown = row.current_drawdown;
  if (row.total_pnl !== null) patch.totalPnl = row.total_pnl;
  if (row.win_count !== null) patch.winCount = row.win_count;
  if (row.loss_count !== null) patch.lossCount = row.loss_count;
  if (row.max_drawdown !== null) patch.maxDrawdown = row.max_drawdown;
  if (row.last_error !== null) patch.error = row.last_error;

  if (Object.keys(patch).length > 0) {
    bot.patchState(patch);
  }
}
