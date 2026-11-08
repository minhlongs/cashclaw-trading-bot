import { err, type Result } from '@/lib/result';
import type { RiskLimitsInput, ExchangeKey } from './types';
import { validateRiskRanges, applyRiskOverrides } from './parsers';
import { loadCurrentSettings, persistSettings, syncExchangeToD1 } from './actions-d1';

export async function mutateExchangeCredentials(
  exchange: ExchangeKey, apiKey: string, apiSecret: string, testnet: boolean, userId?: string,
): Promise<Result<void>> {
  if (!apiKey.trim() || !apiSecret.trim()) return err('API key and secret are required');
  const current = await loadCurrentSettings(userId);
  current.exchanges[exchange] = { apiKey, apiSecret, testnet };
  const saved = await persistSettings(current, userId);
  if (!saved.ok) return saved;
  await syncExchangeToD1(exchange, apiKey, apiSecret, testnet, userId);
  return saved;
}

export async function mutateRiskLimits(input: RiskLimitsInput, userId?: string): Promise<Result<void>> {
  const rangeError = validateRiskRanges(input);
  if (rangeError) return err(rangeError);
  const current = await loadCurrentSettings(userId);
  applyRiskOverrides(current, input);
  return persistSettings(current, userId);
}

export async function mutateNotificationSettings(botToken: string, chatId: string, userId?: string): Promise<Result<void>> {
  const current = await loadCurrentSettings(userId);
  current.notification = { botToken, chatId };
  return persistSettings(current, userId);
}

export async function mutateEmergencyHalt(reason: string, userId?: string): Promise<Result<void>> {
  const current = await loadCurrentSettings(userId);
  current.killswitch = { enabled: false, reason, triggeredAt: Date.now() };
  return persistSettings(current, userId);
}

export async function mutateResumeFromHalt(userId?: string): Promise<Result<void>> {
  const current = await loadCurrentSettings(userId);
  current.killswitch = { enabled: true, reason: null, triggeredAt: null };
  return persistSettings(current, userId);
}
