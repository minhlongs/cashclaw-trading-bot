// Forest layer — Server Actions for user settings
// Exchange credentials, risk limits, killswitch control.
// All settings persist to D1 (single-user v1, single settings row).

'use server';

import { createServerClient } from '@/lib/db/client';
import { findSettingsByUser, upsertSettings, type SettingsRow } from '@/lib/db/repositories';
import { getBotManager } from '@/tree/bot';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';
import { createLogger } from '@/lib/logger';
import { ok, err, type Result } from '@/lib/result';
import { encrypt, decrypt } from '@/lib/crypto';

const log = createLogger('settings-actions');

export interface SettingsData {
  exchanges: {
    binance: { apiKey: string; apiSecret: string; testnet: boolean };
    bybit: { apiKey: string; apiSecret: string; testnet: boolean };
    okx: { apiKey: string; apiSecret: string; testnet: boolean };
  };
  risk: {
    maxDrawdownPct: number;
    dailyLossLimitPct: number;
    cooldownMinutes: number;
    maxOpenOrders: number;
  };
  notification: {
    botToken: string;
    chatId: string;
  };
  killswitch: {
    enabled: boolean;
    reason: string | null;
    triggeredAt: number | null;
  };
  killswitchDaily: {
    dailyPnl: number;
    consecutiveLosses: number;
    peakCapital: number;
    dailyStartTime: number;
  };
}

const SETTINGS_ROW_ID = 'settings_default';

const DEFAULT_EXCHANGES: SettingsData['exchanges'] = {
  binance: { apiKey: '', apiSecret: '', testnet: true },
  bybit: { apiKey: '', apiSecret: '', testnet: true },
  okx: { apiKey: '', apiSecret: '', testnet: true },
};

const DEFAULT_RISK: SettingsData['risk'] = {
  maxDrawdownPct: 15,
  dailyLossLimitPct: 10,
  cooldownMinutes: 30,
  maxOpenOrders: 50,
};

const DEFAULT_NOTIFICATION: SettingsData['notification'] = {
  botToken: '',
  chatId: '',
};

const DEFAULT_KILLSWITCH_DAILY: SettingsData['killswitchDaily'] = {
  dailyPnl: 0,
  consecutiveLosses: 0,
  peakCapital: 0,
  dailyStartTime: Date.now(),
};

// ── D1 helpers ───────────────────────────────────────────────

async function parseExchanges(raw: string): Promise<SettingsData['exchanges']> {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const result = { ...DEFAULT_EXCHANGES };
    for (const key of ['binance', 'bybit', 'okx'] as const) {
      const entry = obj[key];
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const rec = entry as Record<string, unknown>;
        result[key] = {
          apiKey: typeof rec.apiKey === 'string' ? await decrypt(rec.apiKey) : '',
          apiSecret: typeof rec.apiSecret === 'string' ? await decrypt(rec.apiSecret) : '',
          testnet: typeof rec.testnet === 'boolean' ? rec.testnet : true,
        };
      }
    }
    return result;
  } catch (error) {
    log.warn('Failed to parse exchange settings, using defaults', { action: 'parseExchanges', error: error instanceof Error ? error : new Error(String(error)) });
    return { ...DEFAULT_EXCHANGES };
  }
}

function parseRisk(raw: string): SettingsData['risk'] {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      maxDrawdownPct: typeof obj.maxDrawdownPct === 'number' ? obj.maxDrawdownPct : DEFAULT_RISK.maxDrawdownPct,
      dailyLossLimitPct: typeof obj.dailyLossLimitPct === 'number' ? obj.dailyLossLimitPct : DEFAULT_RISK.dailyLossLimitPct,
      cooldownMinutes: typeof obj.cooldownMinutes === 'number' ? obj.cooldownMinutes : DEFAULT_RISK.cooldownMinutes,
      maxOpenOrders: typeof obj.maxOpenOrders === 'number' ? obj.maxOpenOrders : DEFAULT_RISK.maxOpenOrders,
    };
  } catch (error) {
    log.warn('Failed to parse risk settings, using defaults', { action: 'parseRisk', error: error instanceof Error ? error : new Error(String(error)) });
    return { ...DEFAULT_RISK };
  }
}

function parseNotification(raw: string | undefined): SettingsData['notification'] {
  if (!raw) return { ...DEFAULT_NOTIFICATION };
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      botToken: typeof obj.botToken === 'string' ? obj.botToken : '',
      chatId: typeof obj.chatId === 'string' ? obj.chatId : '',
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION };
  }
}

function parseKillswitchDaily(raw: string | undefined): SettingsData['killswitchDaily'] {
  if (!raw) return { ...DEFAULT_KILLSWITCH_DAILY };
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      dailyPnl: typeof obj.dailyPnl === 'number' ? obj.dailyPnl : 0,
      consecutiveLosses: typeof obj.consecutiveLosses === 'number' ? obj.consecutiveLosses : 0,
      peakCapital: typeof obj.peakCapital === 'number' ? obj.peakCapital : 0,
      dailyStartTime: typeof obj.dailyStartTime === 'number' ? obj.dailyStartTime : Date.now(),
    };
  } catch {
    return { ...DEFAULT_KILLSWITCH_DAILY };
  }
}

async function rowToSettingsData(row: SettingsRow): Promise<SettingsData> {
  return {
    exchanges: await parseExchanges(row.exchange_creds_json),
    risk: parseRisk(row.risk_limits_json),
    notification: parseNotification(row.notification_json),
    killswitch: {
      enabled: row.killswitch_enabled === 1,
      reason: row.killswitch_reason,
      triggeredAt: row.killswitch_triggered_at,
    },
    killswitchDaily: parseKillswitchDaily(row.killswitch_daily_json),
  };
}

async function loadCurrentSettings(): Promise<SettingsData> {
  const db = createServerClient();
  if (!db) {
    // D1 not available (local dev SSR) — return defaults with trading enabled
    return {
      exchanges: { ...DEFAULT_EXCHANGES },
      risk: { ...DEFAULT_RISK },
      notification: { ...DEFAULT_NOTIFICATION },
      killswitch: { enabled: true, reason: null, triggeredAt: null },
      killswitchDaily: { ...DEFAULT_KILLSWITCH_DAILY },
    };
  }

  const row = await findSettingsByUser(db, null);
  if (!row) {
    return {
      exchanges: { ...DEFAULT_EXCHANGES },
      risk: { ...DEFAULT_RISK },
      notification: { ...DEFAULT_NOTIFICATION },
      killswitch: { enabled: true, reason: null, triggeredAt: null },
      killswitchDaily: { ...DEFAULT_KILLSWITCH_DAILY },
    };
  }

  // Read killswitch directly from D1 row — no in-memory singleton
  return await rowToSettingsData(row);
}

async function persistSettings(data: SettingsData): Promise<Result<void>> {
  const db = createServerClient();
  if (!db) return err('Database not available');

  // Encrypt exchange credentials before persisting
  const encryptedExchanges: SettingsData['exchanges'] = {
    binance: { ...data.exchanges.binance, apiKey: await encrypt(data.exchanges.binance.apiKey), apiSecret: await encrypt(data.exchanges.binance.apiSecret) },
    bybit: { ...data.exchanges.bybit, apiKey: await encrypt(data.exchanges.bybit.apiKey), apiSecret: await encrypt(data.exchanges.bybit.apiSecret) },
    okx: { ...data.exchanges.okx, apiKey: await encrypt(data.exchanges.okx.apiKey), apiSecret: await encrypt(data.exchanges.okx.apiSecret) },
  };

  const now = Math.floor(Date.now() / 1000);
  const row: SettingsRow = {
    id: SETTINGS_ROW_ID,
    user_id: null,
    exchange_creds_json: JSON.stringify(encryptedExchanges),
    risk_limits_json: JSON.stringify(data.risk),
    notification_json: JSON.stringify(data.notification),
    killswitch_daily_json: JSON.stringify(data.killswitchDaily),
    killswitch_enabled: data.killswitch.enabled ? 1 : 0,
    killswitch_reason: data.killswitch.reason,
    killswitch_triggered_at: data.killswitch.triggeredAt,
    updated_at: now,
  };

  await upsertSettings(db, row);
  return ok(undefined);
}

// ── Public server actions ────────────────────────────────────

export async function getSettings(): Promise<SettingsData> {
  await loadAllBotsFromD1();
  return loadCurrentSettings();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- re-exported for API route
export async function updateExchangeCredentials(
  exchange: 'binance' | 'bybit' | 'okx',
  apiKey: string,
  apiSecret: string,
  testnet: boolean,
): Promise<Result<void>> {
  try {
    if (!apiKey.trim() || !apiSecret.trim()) {
      return err('API key and secret are required');
    }

    const current = await loadCurrentSettings();
    current.exchanges[exchange] = { apiKey, apiSecret, testnet };
    return persistSettings(current);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Update failed');
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- re-exported for API route
export async function updateRiskLimits(input: {
  maxDrawdownPct?: number;
  dailyLossLimitPct?: number;
  cooldownMinutes?: number;
  maxOpenOrders?: number;
}): Promise<Result<void>> {
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

function validateRiskRanges(input: {
  maxDrawdownPct?: number;
  dailyLossLimitPct?: number;
  cooldownMinutes?: number;
  maxOpenOrders?: number;
}): string | null {
  if (input.maxDrawdownPct !== undefined && (input.maxDrawdownPct < 1 || input.maxDrawdownPct > 100)) return 'Max drawdown must be between 1-100%';
  if (input.dailyLossLimitPct !== undefined && (input.dailyLossLimitPct < 1 || input.dailyLossLimitPct > 100)) return 'Daily loss limit must be between 1-100%';
  if (input.cooldownMinutes !== undefined && (input.cooldownMinutes < 1 || input.cooldownMinutes > 1440)) return 'Cooldown must be between 1-1440 minutes';
  if (input.maxOpenOrders !== undefined && (input.maxOpenOrders < 1 || input.maxOpenOrders > 500)) return 'Max open orders must be between 1-500';
  return null;
}

function applyRiskOverrides(current: SettingsData, input: {
  maxDrawdownPct?: number;
  dailyLossLimitPct?: number;
  cooldownMinutes?: number;
  maxOpenOrders?: number;
}): void {
  if (input.maxDrawdownPct !== undefined) current.risk.maxDrawdownPct = input.maxDrawdownPct;
  if (input.dailyLossLimitPct !== undefined) current.risk.dailyLossLimitPct = input.dailyLossLimitPct;
  if (input.cooldownMinutes !== undefined) current.risk.cooldownMinutes = input.cooldownMinutes;
  if (input.maxOpenOrders !== undefined) current.risk.maxOpenOrders = input.maxOpenOrders;
}

export async function updateNotificationSettings(
  botToken: string,
  chatId: string,
): Promise<Result<void>> {
  const current = await loadCurrentSettings();
  current.notification.botToken = botToken;
  current.notification.chatId = chatId;
  return persistSettings(current);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- re-exported for API route
export async function emergencyHalt(reason: string): Promise<Result<void>> {
  try {
    const current = await loadCurrentSettings();
    current.killswitch.enabled = false;
    current.killswitch.reason = reason;
    current.killswitch.triggeredAt = Date.now();
    return persistSettings(current);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Halt failed');
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- re-exported for API route
export async function resumeFromHalt(): Promise<Result<void>> {
  try {
    const current = await loadCurrentSettings();
    current.killswitch.enabled = true;
    current.killswitch.reason = null;
    current.killswitch.triggeredAt = null;
    return persistSettings(current);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Resume failed');
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- re-exported for API route
export async function resetAllBots(): Promise<Result<void>> {
  try {
    const manager = getBotManager();
    for (const bot of manager.getRunningBots()) {
      bot.stop();
    }
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Reset failed');
  }
}

/**
 * Persist killswitch daily state to D1.
 * Called after each trade event to survive Workers cold starts.
 */
export async function saveKillswitchDailyState(daily: {
  dailyPnl: number;
  consecutiveLosses: number;
  peakCapital: number;
  dailyStartTime: number;
}): Promise<void> {
  try {
    const current = await loadCurrentSettings();
    current.killswitchDaily = daily;
    await persistSettings(current);
  } catch (e) {
    log.error('Failed to persist killswitch daily state', e instanceof Error ? e : new Error(String(e)), { action: 'saveKillswitchDailyState' });
  }
}
