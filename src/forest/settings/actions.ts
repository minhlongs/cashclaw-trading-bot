'use server';

import { createLogger } from '@/lib/logger';
import { err, type Result } from '@/lib/result';
import type { SettingsData, RiskLimitsInput, KillswitchDailyInput, ExchangeKey } from './types';
import { loadCurrentSettings, persistSettings } from './actions-d1';
import { mutateExchangeCredentials, mutateRiskLimits, mutateNotificationSettings, mutateEmergencyHalt, mutateResumeFromHalt } from './actions-ops';

export type { SettingsData } from './types';
const log = createLogger('settings-actions');

export async function getSettings(): Promise<SettingsData> { return loadCurrentSettings(); }
export async function updateNotificationSettings(botToken: string, chatId: string): Promise<Result<void>> { return mutateNotificationSettings(botToken, chatId); }

export async function updateExchangeCredentials(exchange: ExchangeKey, apiKey: string, apiSecret: string, testnet: boolean): Promise<Result<void>> {
  try { return await mutateExchangeCredentials(exchange, apiKey, apiSecret, testnet); } catch (e) { return err(e instanceof Error ? e.message : 'Update failed'); }
}

export async function updateRiskLimits(input: RiskLimitsInput): Promise<Result<void>> {
  try { return await mutateRiskLimits(input); } catch (e) { return err(e instanceof Error ? e.message : 'Update failed'); }
}

export async function emergencyHalt(reason: string): Promise<Result<void>> {
  try { return await mutateEmergencyHalt(reason); } catch (e) { return err(e instanceof Error ? e.message : 'Halt failed'); }
}

export async function resumeFromHalt(): Promise<Result<void>> {
  try { return await mutateResumeFromHalt(); } catch (e) { return err(e instanceof Error ? e.message : 'Resume failed'); }
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
