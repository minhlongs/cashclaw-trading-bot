// Forest layer — Server Actions for user settings
// Exchange credentials, risk limits, killswitch control. Persists to D1.

'use server';

import { createServerClient } from '@/lib/db/client';
import { findSettingsByUser, upsertSettings, type SettingsRow } from '@/lib/db/repositories';
import { createLogger } from '@/lib/logger';
import { ok, err, type Result } from '@/lib/result';
import { encrypt } from '@/lib/crypto';
import {
  SETTINGS_ROW_ID,
  createDefaultSettings,
  type SettingsData,
  type RiskLimitsInput,
  type KillswitchDailyInput,
  type ExchangeKey,
} from './types';
import { rowToSettingsData, validateRiskRanges, applyRiskOverrides } from './parsers';

export type { SettingsData } from './types';

const log = createLogger('settings-actions');

async function loadCurrentSettings(): Promise<SettingsData> {
  const db = createServerClient();
  if (!db) return createDefaultSettings();
  const row = await findSettingsByUser(db, null);
  return row ? rowToSettingsData(row) : createDefaultSettings();
}

async function persistSettings(data: SettingsData): Promise<Result<void>> {
  const db = createServerClient();
  if (!db) return err('Database not available');

  const encExchanges = {
    binance: { ...data.exchanges.binance, apiKey: await encrypt(data.exchanges.binance.apiKey), apiSecret: await encrypt(data.exchanges.binance.apiSecret) },
    bybit: { ...data.exchanges.bybit, apiKey: await encrypt(data.exchanges.bybit.apiKey), apiSecret: await encrypt(data.exchanges.bybit.apiSecret) },
    okx: { ...data.exchanges.okx, apiKey: await encrypt(data.exchanges.okx.apiKey), apiSecret: await encrypt(data.exchanges.okx.apiSecret) },
  };

  const row: SettingsRow = {
    id: SETTINGS_ROW_ID,
    user_id: null,
    exchange_creds_json: JSON.stringify(encExchanges),
    risk_limits_json: JSON.stringify(data.risk),
    notification_json: JSON.stringify(data.notification),
    killswitch_daily_json: JSON.stringify(data.killswitchDaily),
    killswitch_enabled: data.killswitch.enabled ? 1 : 0,
    killswitch_reason: data.killswitch.reason,
    killswitch_triggered_at: data.killswitch.triggeredAt,
    updated_at: Math.floor(Date.now() / 1000),
  };

  await upsertSettings(db, row);
  return ok(undefined);
}

export async function getSettings(): Promise<SettingsData> {
  return loadCurrentSettings();
}

export async function updateExchangeCredentials(
  exchange: ExchangeKey,
  apiKey: string,
  apiSecret: string,
  testnet: boolean,
): Promise<Result<void>> {
  try {
    if (!apiKey.trim() || !apiSecret.trim()) return err('API key and secret are required');
    const current = await loadCurrentSettings();
    current.exchanges[exchange] = { apiKey, apiSecret, testnet };
    return persistSettings(current);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Update failed');
  }
}

export async function updateRiskLimits(input: RiskLimitsInput): Promise<Result<void>> {
  try {
    const rangeError = validateRiskRanges(input);
    if (rangeError) return err(rangeError);
    const current = await loadCurrentSettings();
    applyRiskOverrides(current, input);
    return persistSettings(current);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Update failed');
  }
}

export async function updateNotificationSettings(botToken: string, chatId: string): Promise<Result<void>> {
  const current = await loadCurrentSettings();
  current.notification = { botToken, chatId };
  return persistSettings(current);
}

export async function emergencyHalt(reason: string): Promise<Result<void>> {
  try {
    const current = await loadCurrentSettings();
    current.killswitch = { enabled: false, reason, triggeredAt: Date.now() };
    return persistSettings(current);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Halt failed');
  }
}

export async function resumeFromHalt(): Promise<Result<void>> {
  try {
    const current = await loadCurrentSettings();
    current.killswitch = { enabled: true, reason: null, triggeredAt: null };
    return persistSettings(current);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Resume failed');
  }
}

export async function saveKillswitchDailyState(daily: KillswitchDailyInput): Promise<void> {
  try {
    const current = await loadCurrentSettings();
    current.killswitchDaily = daily;
    await persistSettings(current);
  } catch (e) {
    log.error('Failed to persist killswitch daily state', e instanceof Error ? e : new Error(String(e)), { action: 'saveKillswitchDailyState' });
  }
}
