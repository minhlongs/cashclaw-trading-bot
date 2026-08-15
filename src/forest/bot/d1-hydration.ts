/**
 * D1 Hydration Helpers
 * Loads persistent bots from D1 into BotManager on startup.
 */

import { createServerClient } from '@/lib/db/client';
import { findBotsByUser, findAllBots } from '@/lib/db/repositories';
import { getBotManager } from '@/tree/bot';
 
import type { BotState, BotConfig } from '@/tree/bot/types';

// Error handler callback type for structured error logging
export type ErrorHandler = (error: Error, context: string) => void;

// ──────────────────────────────────────────────
// State Restoration Helper
// ──────────────────────────────────────────────

/**
 * Restore BotInstance state from a D1 database row.
 * Shared by hydrateFromD1 and loadAllBotsFromD1.
 */
function restoreBotStateFromRow(
  bot: { getSnapshot: () => BotState; patchState: (patch: Partial<BotState>) => void },
  row: { total_trades: number; started_at: number | null; stopped_at: number | null; last_error: string | null; last_tick_at: number | null; last_order_at: number | null; current_drawdown: number; total_pnl: number; win_count: number; loss_count: number; max_drawdown: number },
): void {
  const patch: Partial<BotState> = {};

  if (row.total_trades !==null) patch.totalTrades = row.total_trades;
  if (row.started_at !==null) patch.startedAt = row.started_at;
  if (row.stopped_at !==null) patch.stoppedAt = row.stopped_at;
  if (row.last_tick_at !==null) patch.lastTickAt = row.last_tick_at;
  if (row.last_order_at !==null) patch.lastOrderAt = row.last_order_at;
  if (row.current_drawdown !==null) patch.currentDrawdown = row.current_drawdown;
  if (row.total_pnl !==null) patch.totalPnl = row.total_pnl;
  if (row.win_count !==null) patch.winCount = row.win_count;
  if (row.loss_count !==null) patch.lossCount = row.loss_count;
  if (row.max_drawdown !==null) patch.maxDrawdown = row.max_drawdown;
  if (row.last_error !==null) patch.error = row.last_error;

  if (Object.keys(patch).length > 0) {
    bot.patchState(patch);
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Load all bots for a user from D1, replay into BotManager.
 * Call once at Workers startup / SSR mount.
 */
export async function hydrateFromD1(userId: string, onError?: ErrorHandler): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const manager = getBotManager();
  const rows = await findBotsByUser(db, userId);

  for (const row of rows) {
    try {
      const config = JSON.parse(row.config_json) as BotConfig;
      const bot = await manager.createBot({
        id: row.id,
        config,
        exchangeConfig: {
          apiKey: '',
          apiSecret: '',
          testnet: true,
          sandbox: true,
          rateLimitMs: 100,
        },
        mode: 'paper',
      });

      restoreBotStateFromRow(bot, row);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error, `d1-adapter:hydrateBot:${row.id}`);
    }
  }
}

/**
 * Tracks bot IDs already hydrated from D1 into BotManager.
 * Module-scoped so it survives across requests in the same Worker isolate.
 */
const hydratedBotIds = new Set<string>();

/**
 * Load ALL bots from D1 (no userId filter — single-user v1).
 * Called by handlers on cold start / SSR mount to populate in-memory state.
 * Safe to call multiple times — already-loaded bots are skipped.
 */
export async function loadAllBotsFromD1(onError?: ErrorHandler): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const manager = getBotManager();
  const rows = await findAllBots(db);

  for (const row of rows) {
    // Skip bots already hydrated in this isolate lifecycle
    if (hydratedBotIds.has(row.id)) continue;

    try {
      const config = JSON.parse(row.config_json) as BotConfig;
      const bot = await manager.createBot({
        id: row.id,
        config,
        exchangeConfig: {
          apiKey: '',
          apiSecret: '',
          testnet: true,
          sandbox: true,
          rateLimitMs: 100,
        },
        mode: 'paper',
      });

      restoreBotStateFromRow(bot, row);
      hydratedBotIds.add(row.id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error, `d1-adapter:loadBot:${row.id}`);
    }
  }
}
