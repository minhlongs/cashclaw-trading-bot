import { getSettings, updateExchangeCredentials, updateRiskLimits, updateNotificationSettings, emergencyHalt, resumeFromHalt } from '@/forest/settings/actions';
import type { z } from 'zod';
import { maskSecret, type SettingsSchema } from './schema';
import type { Result } from '@/lib/result';

export async function getMaskedSettings(userId?: string) {
  const data = await (userId ? getSettings(userId) : getSettings());
  return {
    ...data,
    exchanges: Object.fromEntries(Object.entries(data.exchanges).map(([ex, c]) => [
      ex, { ...c, apiKey: maskSecret(c.apiKey), apiSecret: maskSecret(c.apiSecret) },
    ])),
    notification: { ...data.notification, botToken: maskSecret(data.notification.botToken) },
  };
}

export async function dispatchSettingsUpdate(data: z.infer<typeof SettingsSchema>, userId?: string): Promise<Result<void>> {
  switch (data.type) {
    case 'exchange':
      return userId
        ? updateExchangeCredentials(data.exchange, data.apiKey, data.apiSecret, data.testnet, userId)
        : updateExchangeCredentials(data.exchange, data.apiKey, data.apiSecret, data.testnet);
    case 'risk': {
      const risk = {
        maxDrawdownPct: data.maxDrawdownPct, dailyLossLimitPct: data.dailyLossLimitPct,
        cooldownMinutes: data.cooldownMinutes, maxOpenOrders: data.maxOpenOrders,
      };
      return userId ? updateRiskLimits(risk, userId) : updateRiskLimits(risk);
    }
    case 'notification':
      return userId
        ? updateNotificationSettings(data.botToken, data.chatId, userId)
        : updateNotificationSettings(data.botToken, data.chatId);
    case 'killswitch':
      if (data.action === 'halt') {
        return userId ? emergencyHalt(data.reason, userId) : emergencyHalt(data.reason);
      }
      return userId ? resumeFromHalt(userId) : resumeFromHalt();
  }
}
