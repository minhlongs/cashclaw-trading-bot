// GET /api/settings — list current settings
// POST /api/settings — update settings (exchange creds, risk limits, killswitch)
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSettings, updateExchangeCredentials, updateRiskLimits, emergencyHalt, resumeFromHalt } from '@/forest/settings/actions';

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

const SettingsSchema = z.discriminatedUnion('type', [ExchangeSchema, RiskSchema, KillswitchSchema]);

export async function GET() {
  try {
    const data = await getSettings();
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
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

    if (parsed.data.type === 'killswitch') {
      const { action, reason } = parsed.data;
      const result = action === 'halt'
        ? await emergencyHalt(reason)
        : await resumeFromHalt();
      return NextResponse.json(result, result.ok ? undefined : { status: 400 });
    }

    return NextResponse.json({ ok: false, error: 'Unknown settings type' }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Settings update failed' }, { status: 500 });
  }
}
