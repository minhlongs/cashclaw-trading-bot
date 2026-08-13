// Forest layer — Server Actions for user settings
// Exchange credentials, risk limits, killswitch control.
// All settings persist to D1 (single-user v1, single settings row).

'use server';

import { createServerClient } from '@/lib/db/client';
import { findSettingsByUser, upsertSettings, type SettingsRow } from '@/lib/db/repositories';
import { getBotManager } from '@/tree/bot';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';
import { createLogger } from '@/lib/logger';

const log = createLogger({ module: 'settings-actions' });

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
  killswitch: {
    enabled: boolean;
    reason: string | null;
    triggeredAt: number | null;
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

const DEFAULT_KILLSWITCH: SettingsData['killswitch'] = {
  enabled: true,
  reason: null,
  triggeredAt: null,
};

// ── D1 helpers ───────────────────────────────────────────────

function parseExchanges(raw: string): SettingsData['exchanges'] {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const result = { ...DEFAULT_EXCHANGES };
    for (const key of ['binance', 'bybit', 'okx'] as const) {
      const entry = obj[key];
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const rec = entry as Record<string, unknown>;
        result[key] = {
          apiKey: typeof rec.apiKey === 'string' ? rec.apiKey : '',
          apiSecret: typeof rec.apiSecret === 'string' ? rec.apiSecret : '',
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

function rowToSettingsData(row: SettingsRow): SettingsData {
  return {
    exchanges: parseExchanges(row.exchange_creds_json),
    risk: parseRisk(row.risk_limits_json),
    killswitch: {
      enabled: row.killswitch_enabled === 1,
      reason: row.killswitch_reason,
      triggeredAt: row.killswitch_triggered_at,
    },
  };
}

async function loadCurrentSettings(): Promise<SettingsData> {
  const db = createServerClient();
  if (!db) {
    // D1 not available (local dev SSR) — return defaults
    return {
      exchanges: { ...DEFAULT_EXCHANGES },
      risk: { ...DEFAULT_RISK },
      killswitch: {
        enabled: getBotManager().getKillswitch().isTradingEnabled(),
        reason: null,
        triggeredAt: null,
      },
    };
  }

  const row = await findSettingsByUser(db, null);
  if (!row) {
    return {
      exchanges: { ...DEFAULT_EXCHANGES },
      risk: { ...DEFAULT_RISK },
      killswitch: {
        enabled: getBotManager().getKillswitch().isTradingEnabled(),
        reason: null,
        triggeredAt: null,
      },
    };
  }

  const ks = getBotManager().getKillswitch();
  const data = rowToSettingsData(row);
  // Always use live killswitch state from BotManager
  data.killswitch = {
    enabled: ks.isTradingEnabled(),
    reason: row.killswitch_reason,
    triggeredAt: row.killswitch_triggered_at,
  };
  return data;
}

async function persistSettings(data: SettingsData): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();
  if (!db) return { ok: false, error: 'Database not available' };

  const now = Math.floor(Date.now() / 1000);
  const row: SettingsRow = {
    id: SETTINGS_ROW_ID,
    user_id: null,
    exchange_creds_json: JSON.stringify(data.exchanges),
    risk_limits_json: JSON.stringify(data.risk),
    killswitch_enabled: data.killswitch.enabled ? 1 : 0,
    killswitch_reason: data.killswitch.reason,
    killswitch_triggered_at: data.killswitch.triggeredAt,
    updated_at: now,
  };

  await upsertSettings(db, row);
  return { ok: true };
}

// ── Public server actions ────────────────────────────────────

export async function getSettings(): Promise<SettingsData> {
  await loadAllBotsFromD1();
  return loadCurrentSettings();
}

export async function updateExchangeCredentials(
  exchange: 'binance' | 'bybit' | 'okx',
  apiKey: string,
  apiSecret: string,
  testnet: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!apiKey.trim() || !apiSecret.trim()) {
      return { ok: false, error: 'API key and secret are required' };
    }

    const current = await loadCurrentSettings();
    current.exchanges[exchange] = { apiKey, apiSecret, testnet };
    return persistSettings(current);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
}

export async function updateRiskLimits(input: {
  maxDrawdownPct?: number;
  dailyLossLimitPct?: number;
  cooldownMinutes?: number;
  maxOpenOrders?: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (input.maxDrawdownPct !== undefined && (input.maxDrawdownPct < 1 || input.maxDrawdownPct > 100)) {
      return { ok: false, error: 'Max drawdown must be between 1-100%' };
    }
    if (input.dailyLossLimitPct !== undefined && (input.dailyLossLimitPct < 1 || input.dailyLossLimitPct > 100)) {
      return { ok: false, error: 'Daily loss limit must be between 1-100%' };
    }
    if (input.cooldownMinutes !== undefined && (input.cooldownMinutes < 1 || input.cooldownMinutes > 1440)) {
      return { ok: false, error: 'Cooldown must be between 1-1440 minutes' };
    }
    if (input.maxOpenOrders !== undefined && (input.maxOpenOrders < 1 || input.maxOpenOrders > 500)) {
      return { ok: false, error: 'Max open orders must be between 1-500' };
    }

    const current = await loadCurrentSettings();
    if (input.maxDrawdownPct !== undefined) current.risk.maxDrawdownPct = input.maxDrawdownPct;
    if (input.dailyLossLimitPct !== undefined) current.risk.dailyLossLimitPct = input.dailyLossLimitPct;
    if (input.cooldownMinutes !== undefined) current.risk.cooldownMinutes = input.cooldownMinutes;
    if (input.maxOpenOrders !== undefined) current.risk.maxOpenOrders = input.maxOpenOrders;

    return persistSettings(current);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
}

export async function emergencyHalt(reason: string): Promise<{ ok: boolean; error?: string }> {
  try {
    getBotManager().getKillswitch().manualHalt(reason);
    // Persist killswitch halt to D1
    const current = await loadCurrentSettings();
    current.killswitch.enabled = false;
    current.killswitch.reason = reason;
    current.killswitch.triggeredAt = Date.now();
    return persistSettings(current);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Halt failed' };
  }
}

export async function resumeFromHalt(): Promise<{ ok: boolean; error?: string }> {
  try {
    getBotManager().getKillswitch().manualResume();
    // Persist killswitch resume to D1
    const current = await loadCurrentSettings();
    current.killswitch.enabled = true;
    current.killswitch.reason = null;
    current.killswitch.triggeredAt = null;
    return persistSettings(current);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Resume failed' };
  }
}

export async function resetAllBots(): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    for (const bot of manager.getRunningBots()) {
      bot.stop();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Reset failed' };
  }
}
