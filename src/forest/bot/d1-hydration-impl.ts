/**
 * D1 Hydration — Implementation
 * Loads persistent bots from D1 into BotManager on startup.
 */

import { createServerClient } from '@/lib/db/client';
import { findBotsByUser, findAllBots } from '@/lib/db/repositories';
import { getBotManager } from '@/tree/bot';
import type { BotState, BotConfig } from '@/tree/bot/types';
import type { ErrorHandler } from './d1-hydration';
import { restoreBotStateFromRow, type BotHydrateRow } from './d1-hydration-mapper';

type HydratableBot = {
  getSnapshot: () => BotState;
  patchState: (patch: Partial<BotState>) => void;
};

/**
 * Create a BotInstance from a D1 row, or return null on failure.
 * Extracted helper keeps hydrateFromD1 / loadAllBotsFromD1 lean.
 */
async function createBotFromRow(
  row: BotHydrateRow & { id: string; config_json: string },
  onError: ErrorHandler | undefined,
  errorContext: string,
): Promise<HydratableBot | null> {
  const manager = getBotManager();
  try {
    const config = JSON.parse(row.config_json) as BotConfig;
    const bot = await manager.createBot({
      id: row.id,
      config,
      exchangeConfig: { apiKey: '', apiSecret: '', testnet: true, sandbox: true, rateLimitMs: 100 },
      mode: 'paper',
    });
    return bot as HydratableBot;
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)), errorContext);
    return null;
  }
}

/**
 * Load all bots for a user from D1, replay into BotManager.
 * Call once at Workers startup / SSR mount.
 */
export async function hydrateFromD1(userId: string, onError?: ErrorHandler): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const rows = await findBotsByUser(db, userId);

  for (const row of rows) {
    const hydratedRow = row as unknown as BotHydrateRow;
    const bot = await createBotFromRow(
      { ...row, ...hydratedRow } as BotHydrateRow & { id: string; config_json: string },
      onError,
      `d1-adapter:hydrateBot:${row.id}`,
    );
    if (bot) restoreBotStateFromRow(bot, hydratedRow);
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
 *
 * @deprecated Use BotQueryService for read-only access or BotManager.getOrCreateBot()
 * for lazy single-bot hydration. This function is retained for backward compatibility
 * with hydrateFromD1 and will be removed in a future refactor.
 */
export async function loadAllBotsFromD1(onError?: ErrorHandler): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const rows = await findAllBots(db);

  for (const row of rows) {
    if (hydratedBotIds.has(row.id)) continue;

    const hydratedRow = row as unknown as BotHydrateRow;
    const bot = await createBotFromRow(
      { ...row, ...hydratedRow } as BotHydrateRow & { id: string; config_json: string },
      onError,
      `d1-adapter:loadBot:${row.id}`,
    );
    if (bot) {
      restoreBotStateFromRow(bot, hydratedRow);
      hydratedBotIds.add(row.id);
    }
  }
}
