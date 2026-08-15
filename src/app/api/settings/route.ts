// GET /api/settings — list current settings
// POST /api/settings — update settings (exchange creds, risk limits, killswitch)
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSettings, updateExchangeCredentials, updateRiskLimits, updateNotificationSettings, emergencyHalt, resumeFromHalt } from '@/forest/settings/actions';
import { checkRateLimit, getRateLimitHeaders } from '@/forest/api/rate-limiter';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api-settings');

const ExchangeSchema = z.object({
  type: z.literal('exchange'),
  exchange: z.enum(['binance', 'bybit', 'okx']),
  apiKey: z.string().optional().default(''),
  apiSecret: z.string().optional().default(''),
  testnet: z.boolean().optional().default(true),
});

const RiskSchema = z.object({
  type: z.literal('risk'),
  maxDrawdownPct: z.number().min(1).max(100).optional(),
  dailyLossLimitPct: z.number().min(1).max(100).optional(),
  cooldownMinutes: z.number().min(1).max(1440).optional(),
  maxOpenOrders: z.number().min(1).max(500).optional(),
});

const KillswitchSchema = z.object({
  type: z.literal('killswitch'),
  action: z.enum(['halt', 'resume']),
  reason: z.string().optional().default('Manual halt from settings'),
});

const NotificationSchema = z.object({
  type: z.literal('notification'),
  botToken: z.string().optional().default(''),
  chatId: z.string().optional().default(''),
});

const SettingsSchema = z.discriminatedUnion('type', [ExchangeSchema, RiskSchema, NotificationSchema, KillswitchSchema]);

function maskSecret(value: string | undefined): string {
  if (!value || value.length === 0) return '';
  if (value.length <= 4) return '••••';
  return value.slice(0, 2) + '••••' + value.slice(-2);
}

export async function GET() {
  try {
    const data = await getSettings();
    const masked = {
      ...data,
      exchanges: Object.fromEntries(
        Object.entries(data.exchanges).map(([exchange, creds]) => [
          exchange,
          { ...creds, apiKey: maskSecret(creds.apiKey), apiSecret: maskSecret(creds.apiSecret) },
        ]),
      ),
      notification: {
        ...data.notification,
        botToken: maskSecret(data.notification.botToken),
      },
    };
    return NextResponse.json({ ok: true, data: masked });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error('Failed to load settings', err, { action: 'get-settings' });
    return NextResponse.json({ ok: false, error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const rateLimit = checkRateLimit('settings:update');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  try {
    const body = await req.json();
    const parsed = SettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 });
    }

    if (parsed.data.type === 'exchange') {
      const { exchange, apiKey, apiSecret, testnet } = parsed.data;
      const result = await updateExchangeCredentials(exchange, apiKey, apiSecret, testnet);
      return NextResponse.json(result, result.ok ? undefined : { status: 400 });
    }

    if (parsed.data.type === 'risk') {
      const { maxDrawdownPct, dailyLossLimitPct, cooldownMinutes, maxOpenOrders } = parsed.data;
      const result = await updateRiskLimits({
        maxDrawdownPct,
        dailyLossLimitPct,
        cooldownMinutes,
        maxOpenOrders,
      });
      return NextResponse.json(result, result.ok ? undefined : { status: 400 });
    }

    if (parsed.data.type === 'notification') {
      const { botToken, chatId } = parsed.data;
      const result = await updateNotificationSettings(botToken, chatId);
      return NextResponse.json(result, result.ok ? undefined : { status: 400 });
    }

    if (parsed.data.type === 'killswitch') {
      const { action, reason } = parsed.data;
      const result = action === 'halt'
        ? await emergencyHalt(reason)
        : await resumeFromHalt();
      return NextResponse.json(result, result.ok ? undefined : { status: 400 });
    }

    return NextResponse.json({ ok: false, error: 'Unknown settings type' }, { status: 400 });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error('Settings update failed', err, { action: 'update-settings' });
    return NextResponse.json({ ok: false, error: 'Settings update failed' }, { status: 500 });
  }
}
