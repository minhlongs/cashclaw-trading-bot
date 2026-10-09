import { z } from 'zod';

export const ExchangeSchema = z.object({
  type: z.literal('exchange'),
  exchange: z.enum(['binance', 'bybit', 'okx']),
  apiKey: z.string().optional().default(''),
  apiSecret: z.string().optional().default(''),
  testnet: z.boolean().optional().default(true),
});

export const RiskSchema = z.object({
  type: z.literal('risk'),
  maxDrawdownPct: z.number().min(1).max(100).optional(),
  dailyLossLimitPct: z.number().min(1).max(100).optional(),
  cooldownMinutes: z.number().min(1).max(1440).optional(),
  maxOpenOrders: z.number().min(1).max(500).optional(),
});

export const KillswitchSchema = z.object({
  type: z.literal('killswitch'),
  action: z.enum(['halt', 'resume']),
  reason: z.string().optional().default('Manual halt from settings'),
});

export const NotificationSchema = z.object({
  type: z.literal('notification'),
  botToken: z.string().optional().default(''),
  chatId: z.string().optional().default(''),
});

export const SettingsSchema = z.discriminatedUnion('type', [
  ExchangeSchema, RiskSchema, NotificationSchema, KillswitchSchema,
]);

export function maskSecret(value: string | undefined): string {
  if (!value || value.length === 0) return '';
  if (value.length <= 4) return '••••';
  return value.slice(0, 2) + '••••' + value.slice(-2);
}
