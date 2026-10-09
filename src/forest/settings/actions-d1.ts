import { createServerClient } from '@/lib/db/client';
import { findSettingsByUser, upsertSettings, type SettingsRow } from '@/lib/db/repositories';
import { ok, err, type Result } from '@/lib/result';
import { encrypt } from '@/lib/crypto';
import { SETTINGS_ROW_ID, createDefaultSettings, type SettingsData } from './types';
import { rowToSettingsData } from './parsers';

export async function loadCurrentSettings(): Promise<SettingsData> {
  const db = createServerClient();
  if (!db) return createDefaultSettings();
  const row = await findSettingsByUser(db, null);
  return row ? rowToSettingsData(row) : createDefaultSettings();
}

export async function persistSettings(data: SettingsData): Promise<Result<void>> {
  const db = createServerClient();
  if (!db) return err('Database not available');
  const encExchanges = {
    binance: { ...data.exchanges.binance, apiKey: await encrypt(data.exchanges.binance.apiKey), apiSecret: await encrypt(data.exchanges.binance.apiSecret) },
    bybit: { ...data.exchanges.bybit, apiKey: await encrypt(data.exchanges.bybit.apiKey), apiSecret: await encrypt(data.exchanges.bybit.apiSecret) },
    okx: { ...data.exchanges.okx, apiKey: await encrypt(data.exchanges.okx.apiKey), apiSecret: await encrypt(data.exchanges.okx.apiSecret) },
  };
  const row: SettingsRow = {
    id: SETTINGS_ROW_ID, user_id: null, exchange_creds_json: JSON.stringify(encExchanges),
    risk_limits_json: JSON.stringify(data.risk), notification_json: JSON.stringify(data.notification),
    killswitch_daily_json: JSON.stringify(data.killswitchDaily),
    killswitch_enabled: data.killswitch.enabled ? 1 : 0, killswitch_reason: data.killswitch.reason,
    killswitch_triggered_at: data.killswitch.triggeredAt, updated_at: Math.floor(Date.now() / 1000),
  };
  await upsertSettings(db, row);
  return ok(undefined);
}
