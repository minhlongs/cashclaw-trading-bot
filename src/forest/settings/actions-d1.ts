import { createServerClient } from '@/lib/db/client';
import {
  findSettingsByUser,
  upsertCredential,
  upsertSettings,
  type SettingsRow,
} from '@/lib/db/repositories';
import { ok, err, type Result } from '@/lib/result';
import { encrypt } from '@/lib/crypto';
import {
  SETTINGS_ROW_ID,
  createDefaultSettings,
  type ExchangeKey,
  type SettingsData,
} from './types';
import { rowToSettingsData } from './parsers';

export async function loadCurrentSettings(userId?: string): Promise<SettingsData> {
  const db = createServerClient();
  if (!db) return createDefaultSettings();
  const row = await findSettingsByUser(db, userId ?? null);
  return row ? rowToSettingsData(row) : createDefaultSettings();
}

export async function persistSettings(data: SettingsData, userId?: string): Promise<Result<void>> {
  const db = createServerClient();
  if (!db) return err('Database not available');
  const encExchanges = {
    binance: { ...data.exchanges.binance, apiKey: await encrypt(data.exchanges.binance.apiKey), apiSecret: await encrypt(data.exchanges.binance.apiSecret) },
    bybit: { ...data.exchanges.bybit, apiKey: await encrypt(data.exchanges.bybit.apiKey), apiSecret: await encrypt(data.exchanges.bybit.apiSecret) },
    okx: { ...data.exchanges.okx, apiKey: await encrypt(data.exchanges.okx.apiKey), apiSecret: await encrypt(data.exchanges.okx.apiSecret) },
  };
  const row: SettingsRow = {
    id: userId ? `settings_${userId}` : SETTINGS_ROW_ID, user_id: userId ?? null,
    exchange_creds_json: JSON.stringify(encExchanges),
    risk_limits_json: JSON.stringify(data.risk), notification_json: JSON.stringify(data.notification),
    killswitch_daily_json: JSON.stringify(data.killswitchDaily),
    killswitch_enabled: data.killswitch.enabled ? 1 : 0, killswitch_reason: data.killswitch.reason,
    killswitch_triggered_at: data.killswitch.triggeredAt, updated_at: Math.floor(Date.now() / 1000),
  };
  await upsertSettings(db, row);
  return ok(undefined);
}

/**
 * Mirrors a saved exchange key into the bot-start preflight store. The bot control
 * handler reads api_credentials to decide whether a bot may start, so a settings-only
 * write would leave every start blocked for that exchange.
 */
export async function syncExchangeToD1(
  exchange: ExchangeKey, apiKey: string, apiSecret: string, testnet: boolean, userId?: string,
): Promise<void> {
  const db = createServerClient();
  if (!db) return;
  const ownerId = userId ?? 'default';
  const now = Math.floor(Date.now() / 1000);
  await upsertCredential(db, {
    id: `cred_${ownerId}_${exchange}`,
    user_id: ownerId,
    exchange,
    api_key_encrypted: await encrypt(apiKey),
    api_secret_encrypted: await encrypt(apiSecret),
    is_testnet: testnet ? 1 : 0,
    created_at: now,
    updated_at: now,
  });
}
