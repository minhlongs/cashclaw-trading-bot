'use server';

import { createLogger } from '@/lib/logger';
import { err, type Result } from '@/lib/result';
import type { SettingsData, RiskLimitsInput, KillswitchDailyInput, ExchangeKey } from './types';
import { loadCurrentSettings, persistSettings } from './actions-d1';
import { mutateExchangeCredentials, mutateRiskLimits, mutateNotificationSettings, mutateEmergencyHalt, mutateResumeFromHalt } from './actions-ops';

export type { SettingsData } from './types';
const log = createLogger('settings-actions');

export async function getSettings(userId?: string): Promise<SettingsData> { return loadCurrentSettings(userId); }
export async function updateNotificationSettings(botToken: string, chatId: string, userId?: string): Promise<Result<void>> {
  try { return await mutateNotificationSettings(botToken, chatId, userId); } catch (e) { return err(e instanceof Error ? e.message : 'Update failed'); }
}

export async function updateExchangeCredentials(
  exchange: ExchangeKey, apiKey: string, apiSecret: string, testnet: boolean, userId?: string,
): Promise<Result<void>> {
  try { return await mutateExchangeCredentials(exchange, apiKey, apiSecret, testnet, userId); } catch (e) { return err(e instanceof Error ? e.message : 'Update failed'); }
}

export async function updateRiskLimits(input: RiskLimitsInput, userId?: string): Promise<Result<void>> {
  try { return await mutateRiskLimits(input, userId); } catch (e) { return err(e instanceof Error ? e.message : 'Update failed'); }
}

export async function emergencyHalt(reason: string, userId?: string): Promise<Result<void>> {
  try { return await mutateEmergencyHalt(reason, userId); } catch (e) { return err(e instanceof Error ? e.message : 'Halt failed'); }
}

export async function resumeFromHalt(userId?: string): Promise<Result<void>> {
  try { return await mutateResumeFromHalt(userId); } catch (e) { return err(e instanceof Error ? e.message : 'Resume failed'); }
}

export async function saveKillswitchDailyState(daily: KillswitchDailyInput, userId?: string): Promise<void> {
  try {
    const current = await loadCurrentSettings(userId);
    current.killswitchDaily = daily;
    await persistSettings(current, userId);
  } catch (e) {
    log.error('Failed to persist killswitch daily state', e instanceof Error ? e : new Error(String(e)), { action: 'saveKillswitchDailyState' });
  }
}
