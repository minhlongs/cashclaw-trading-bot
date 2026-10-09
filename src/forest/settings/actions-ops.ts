import { err, type Result } from '@/lib/result';
import type { RiskLimitsInput, ExchangeKey } from './types';
import { validateRiskRanges, applyRiskOverrides } from './parsers';
import { loadCurrentSettings, persistSettings } from './actions-d1';

export async function mutateExchangeCredentials(
  exchange: ExchangeKey, apiKey: string, apiSecret: string, testnet: boolean,
): Promise<Result<void>> {
  if (!apiKey.trim() || !apiSecret.trim()) return err('API key and secret are required');
  const current = await loadCurrentSettings();
  current.exchanges[exchange] = { apiKey, apiSecret, testnet };
  return persistSettings(current);
}

export async function mutateRiskLimits(input: RiskLimitsInput): Promise<Result<void>> {
  const rangeError = validateRiskRanges(input);
  if (rangeError) return err(rangeError);
  const current = await loadCurrentSettings();
  applyRiskOverrides(current, input);
  return persistSettings(current);
}

export async function mutateNotificationSettings(botToken: string, chatId: string): Promise<Result<void>> {
  const current = await loadCurrentSettings();
  current.notification = { botToken, chatId };
  return persistSettings(current);
}

export async function mutateEmergencyHalt(reason: string): Promise<Result<void>> {
  const current = await loadCurrentSettings();
  current.killswitch = { enabled: false, reason, triggeredAt: Date.now() };
  return persistSettings(current);
}

export async function mutateResumeFromHalt(): Promise<Result<void>> {
  const current = await loadCurrentSettings();
  current.killswitch = { enabled: true, reason: null, triggeredAt: null };
  return persistSettings(current);
}
