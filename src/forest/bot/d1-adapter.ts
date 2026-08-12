/**
 * BotManager D1 Adapter
 * Syncs BotManager in-memory state → D1 on every state change.
 * Loads persistent bots from D1 on startup.
 */

import { createServerClient } from '@/lib/db/client';
import type {
  User, Bot, Trade, ApiCredential, TradeEvent, CapitalSnapshot, AuditLog,
} from '@/lib/db/types';
import {
  findBotById, findBotsByUser, findAllBots, insertBot, updateBot, deleteBot,
  findTradesByBot, insertTrade, updateTrade,
  findCredential, upsertCredential,
  insertTradeEvent, insertCapitalSnapshot, insertAudit,
} from '@/lib/db/repositories';
import { getBotManager } from '@/tree/bot';
import type { BotConfig, GridBotConfig, MeanRevBotConfig } from '@/tree/bot/types';
import { isGridConfig } from '@/tree/bot';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): number {
  return Date.now();
}

function botToRow(bot: {
  id: string; config: BotConfig; capital: number;
  user_id: string; name: string; strategy: string; pair: string; exchange: string;
}): Omit<Bot, 'created_at' | 'updated_at'> {
  const cfg = bot.config as GridBotConfig | MeanRevBotConfig;
  return {
    id: bot.id,
    user_id: bot.user_id,
    name: bot.name,
    strategy: bot.strategy as Bot['strategy'],
    pair: bot.pair,
    exchange: bot.exchange as Bot['exchange'],
    status: 'draft',
    config_json: JSON.stringify(cfg),
    capital_allocated: bot.capital,
    capital_used: 0,
    total_pnl: 0,
    win_count: 0,
    loss_count: 0,
    max_drawdown: 0,
    total_trades: 0,
    started_at: null,
    stopped_at: null,
    last_error: null,
    last_tick_at: null,
    last_order_at: null,
    current_drawdown: 0,
  };
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Load all bots for a user from D1, replay into BotManager.
 * Call once at Workers startup / SSR mount.
 */
export async function hydrateFromD1(userId: string): Promise<void> {
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

      // Restore persisted BotState fields from D1 row
      const snapshot = bot.getSnapshot();
      const patch: Record<string, unknown> = {};

      if (row.total_trades != null && row.total_trades !== snapshot.totalTrades) {
        patch.totalTrades = row.total_trades;
      }
      if (row.started_at != null) {
        patch.startedAt = row.started_at;
      }
      if (row.stopped_at != null) {
        patch.stoppedAt = row.stopped_at;
      }
      if (row.last_error != null) {
        patch.error = row.last_error;
      }
      if (row.last_tick_at != null) {
        patch.lastTickAt = row.last_tick_at;
      }
      if (row.last_order_at != null) {
        patch.lastOrderAt = row.last_order_at;
      }
      if (row.current_drawdown != null && row.current_drawdown !== snapshot.currentDrawdown) {
        patch.currentDrawdown = row.current_drawdown;
      }
      if (row.total_pnl != null && row.total_pnl !== snapshot.totalPnl) {
        patch.totalPnl = row.total_pnl;
      }
      if (row.win_count != null && row.win_count !== snapshot.winCount) {
        patch.winCount = row.win_count;
      }
      if (row.loss_count != null && row.loss_count !== snapshot.lossCount) {
        patch.lossCount = row.loss_count;
      }
      if (row.max_drawdown != null && row.max_drawdown !== snapshot.maxDrawdown) {
        patch.maxDrawdown = row.max_drawdown;
      }

      if (Object.keys(patch).length > 0) {
        bot.patchState(patch);
      }
    } catch {
      // skip malformed config
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
export async function loadAllBotsFromD1(): Promise<void> {
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

      // Restore persisted BotState fields from D1 row
      const snapshot = bot.getSnapshot();
      const patch: Record<string, unknown> = {};

      if (row.total_trades != null && row.total_trades !== snapshot.totalTrades) {
        patch.totalTrades = row.total_trades;
      }
      if (row.started_at != null) {
        patch.startedAt = row.started_at;
      }
      if (row.stopped_at != null) {
        patch.stoppedAt = row.stopped_at;
      }
      if (row.last_error != null) {
        patch.error = row.last_error;
      }
      if (row.last_tick_at != null) {
        patch.lastTickAt = row.last_tick_at;
      }
      if (row.last_order_at != null) {
        patch.lastOrderAt = row.last_order_at;
      }
      if (row.current_drawdown != null && row.current_drawdown !== snapshot.currentDrawdown) {
        patch.currentDrawdown = row.current_drawdown;
      }
      if (row.total_pnl != null && row.total_pnl !== snapshot.totalPnl) {
        patch.totalPnl = row.total_pnl;
      }
      if (row.win_count != null && row.win_count !== snapshot.winCount) {
        patch.winCount = row.win_count;
      }
      if (row.loss_count != null && row.loss_count !== snapshot.lossCount) {
        patch.lossCount = row.loss_count;
      }
      if (row.max_drawdown != null && row.max_drawdown !== snapshot.maxDrawdown) {
        patch.maxDrawdown = row.max_drawdown;
      }

      // Apply patch if there are differences
      if (Object.keys(patch).length > 0) {
        bot.patchState(patch);
      }

      hydratedBotIds.add(row.id);
    } catch {
      // skip malformed config or bots that BotManager already holds
    }
  }
}

/**
 * Persist a new bot to D1.
 */
export async function persistBot(userId: string, bot: {
  id: string; config: BotConfig; capital: number;
  name: string; strategy: string; pair: string; exchange: string;
}): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const row = botToRow({ ...bot, user_id: userId });
  const full: Bot = { ...row, created_at: now(), updated_at: now() };
  await insertBot(db, full);
}

/**
 * Update bot fields in D1 (status, pnl, etc.).
 */
export async function patchBot(botId: string, patch: Partial<Bot>): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const data = { ...patch, updated_at: now() };
  await updateBot(db, botId, data);
}

/**
 * Delete a bot from D1.
 */
export async function deleteBotRecord(botId: string): Promise<void> {
  const db = createServerClient();
  if (!db) return;
  await deleteBot(db, botId);
}

/**
 * Persist a trade fill to D1.
 */
export async function persistTrade(botId: string, trade: {
  side: 'buy' | 'sell'; entryPrice: number; exitPrice?: number;
  quantity: number; pnl?: number; status: Trade['status'];
  exchangeOrderId?: string;
}): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const row: Omit<Trade, 'created_at'> = {
    id: `trade_${uid()}`,
    bot_id: botId,
    pair: '',
    side: trade.side,
    entry_price: trade.entryPrice,
    exit_price: trade.exitPrice ?? null,
    quantity: trade.quantity,
    pnl: trade.pnl ?? null,
    fee: 0,
    status: trade.status,
    exchange_order_id: trade.exchangeOrderId ?? null,
    error_message: null,
    opened_at: now(),
    closed_at: trade.exitPrice !== undefined ? now() : null,
  };

  await insertTrade(db, row as Trade);
}

/**
 * Persist exchange API credentials (encrypted).
 * NOTE: encryption must happen before calling this — this stores the ciphertext.
 */
export async function persistCredential(userId: string, cred: {
  exchange: string; apiKeyEncrypted: string; apiSecretEncrypted: string; isTestnet: boolean;
}): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const row: Omit<ApiCredential, 'created_at' | 'updated_at'> = {
    id: `cred_${uid()}`,
    user_id: userId,
    exchange: cred.exchange,
    api_key_encrypted: cred.apiKeyEncrypted,
    api_secret_encrypted: cred.apiSecretEncrypted,
    is_testnet: cred.isTestnet ? 1 : 0,
  };

  await upsertCredential(db, row as ApiCredential);
}

/**
 * Write telemetry event.
 */
export async function persistEvent(botId: string, eventType: TradeEvent['event_type'], detail: Record<string, unknown> = {}): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  await insertTradeEvent(db, {
    id: `evt_${uid()}`,
    bot_id: botId,
    event_type: eventType,
    detail_json: JSON.stringify(detail),
    created_at: now(),
  });
}

/**
 * Write capital snapshot.
 */
export async function persistSnapshot(botId: string, snap: {
  totalCapital: number; realizedPnl: number; unrealizedPnl?: number;
  maxDrawdownPct: number; winCount: number; lossCount: number; totalTrades: number;
}): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  await insertCapitalSnapshot(db, {
    id: `snap_${uid()}`,
    bot_id: botId,
    total_capital: snap.totalCapital,
    realized_pnl: snap.realizedPnl,
    unrealized_pnl: snap.unrealizedPnl ?? 0,
    max_drawdown_pct: snap.maxDrawdownPct,
    win_count: snap.winCount,
    loss_count: snap.lossCount,
    total_trades: snap.totalTrades,
    created_at: now(),
  });
}

/**
 * Write audit log entry.
 */
export async function persistAudit(userId: string | null, botId: string | null, action: string, detail: Record<string, unknown> = {}): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  await insertAudit(db, {
    id: `audit_${uid()}`,
    user_id: userId,
    bot_id: botId,
    action,
    detail_json: JSON.stringify(detail),
    created_at: now(),
  });
}
