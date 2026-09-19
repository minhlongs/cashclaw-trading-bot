/**
 * D1 Persistence - Bot lifecycle & credential operations.
 */

import { createServerClient } from '@/lib/db/client';
import type { Bot, ApiCredential } from '@/lib/db/types';
import {
  insertBot,
  updateBot,
  deleteBot,
  upsertCredential,
} from '@/lib/db/repositories';
import type { BotConfig, GridBotConfig, MeanRevBotConfig } from '@/tree/bot/types';
import { uid, now } from './d1-persistence-utils';

function botToRow(bot: {
  id: string; config: BotConfig; capital: number;
  user_id: string; name: string; strategy: string; pair: string; exchange: string;
}): Omit<Bot, 'created_at' | 'updated_at'> {
  const cfg = bot.config as GridBotConfig | MeanRevBotConfig;
  return {
    id: bot.id,
    user_id: bot.user_id,
    name: bot.name || bot.id,
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

/** Persist a new bot to D1. */
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

/** Update bot fields in D1 (status, pnl, etc.). */
export async function patchBot(botId: string, patch: Partial<Bot>): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const data = { ...patch, updated_at: now() };
  await updateBot(db, botId, data);
}

/** Delete a bot from D1. */
export async function deleteBotRecord(botId: string): Promise<void> {
  const db = createServerClient();
  if (!db) return;
  await deleteBot(db, botId);
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
