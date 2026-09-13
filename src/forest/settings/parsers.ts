// Forest layer — Settings parsers and validation
// Deserializes D1 SettingsRow records with fail-safe fallbacks and risk range validation.

import { decrypt } from '@/lib/crypto';
import { createLogger } from '@/lib/logger';
import type { SettingsRow } from '@/lib/db/repositories';
import {
  DEFAULT_EXCHANGES,
  DEFAULT_RISK,
  DEFAULT_NOTIFICATION,
  DEFAULT_KILLSWITCH_DAILY,
  type SettingsData,
  type RiskLimitsInput,
} from './types';

const log = createLogger('settings-parsers');

export async function parseExchanges(raw: string): Promise<SettingsData['exchanges']> {
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

export function parseRisk(raw: string): SettingsData['risk'] {
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

export function parseNotification(raw: string | undefined): SettingsData['notification'] {
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

export function parseKillswitchDaily(raw: string | undefined): SettingsData['killswitchDaily'] {
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

export async function rowToSettingsData(row: SettingsRow): Promise<SettingsData> {
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

export function validateRiskRanges(input: RiskLimitsInput): string | null {
  if (input.maxDrawdownPct !== undefined && (input.maxDrawdownPct < 1 || input.maxDrawdownPct > 100)) return 'Max drawdown must be between 1-100%';
  if (input.dailyLossLimitPct !== undefined && (input.dailyLossLimitPct < 1 || input.dailyLossLimitPct > 100)) return 'Daily loss limit must be between 1-100%';
  if (input.cooldownMinutes !== undefined && (input.cooldownMinutes < 1 || input.cooldownMinutes > 1440)) return 'Cooldown must be between 1-1440 minutes';
  if (input.maxOpenOrders !== undefined && (input.maxOpenOrders < 1 || input.maxOpenOrders > 500)) return 'Max open orders must be between 1-500';
  return null;
}

export function applyRiskOverrides(current: SettingsData, input: RiskLimitsInput): void {
  if (input.maxDrawdownPct !== undefined) current.risk.maxDrawdownPct = input.maxDrawdownPct;
  if (input.dailyLossLimitPct !== undefined) current.risk.dailyLossLimitPct = input.dailyLossLimitPct;
  if (input.cooldownMinutes !== undefined) current.risk.cooldownMinutes = input.cooldownMinutes;
  if (input.maxOpenOrders !== undefined) current.risk.maxOpenOrders = input.maxOpenOrders;
}
