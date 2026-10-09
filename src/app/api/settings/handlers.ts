import { getSettings, updateExchangeCredentials, updateRiskLimits, updateNotificationSettings, emergencyHalt, resumeFromHalt } from '@/forest/settings/actions';
import type { z } from 'zod';
import { maskSecret, type SettingsSchema } from './schema';
import type { Result } from '@/lib/result';

export async function getMaskedSettings() {
  const data = await getSettings();
  return {
    ...data,
    exchanges: Object.fromEntries(Object.entries(data.exchanges).map(([ex, c]) => [
      ex, { ...c, apiKey: maskSecret(c.apiKey), apiSecret: maskSecret(c.apiSecret) },
    ])),
    notification: { ...data.notification, botToken: maskSecret(data.notification.botToken) },
  };
}

export async function dispatchSettingsUpdate(data: z.infer<typeof SettingsSchema>): Promise<Result<void>> {
  switch (data.type) {
    case 'exchange':
      return updateExchangeCredentials(data.exchange, data.apiKey, data.apiSecret, data.testnet);
    case 'risk':
      return updateRiskLimits({
        maxDrawdownPct: data.maxDrawdownPct, dailyLossLimitPct: data.dailyLossLimitPct,
        cooldownMinutes: data.cooldownMinutes, maxOpenOrders: data.maxOpenOrders,
      });
    case 'notification':
      return updateNotificationSettings(data.botToken, data.chatId);
    case 'killswitch':
      return data.action === 'halt' ? emergencyHalt(data.reason) : resumeFromHalt();
  }
}
