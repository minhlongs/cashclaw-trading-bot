// GET /api/settings — list current settings
// POST /api/settings — update settings (exchange creds, risk limits)
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSettings, updateExchangeCredentials, updateRiskLimits } from '@/forest/settings/actions';

const ExchangeSchema = z.object({
  type: z.literal('exchange'),
  exchange: z.enum(['binance', 'bybit', 'okx']),
  apiKey: z.string().optional().default(''),
  apiSecret: z.string().optional().default(''),
  testnet: z.boolean().optional().default(true),
});

const RiskSchema = z.object({
  type: z.literal('risk'),
  maxDrawdownPct: z.number().min(0).max(100).optional(),
  dailyLossLimitPct: z.number().min(0).max(100).optional(),
});

const SettingsSchema = z.discriminatedUnion('type', [ExchangeSchema, RiskSchema]);

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

    const { maxDrawdownPct, dailyLossLimitPct } = parsed.data;
    const result = await updateRiskLimits({
      maxDrawdownPct,
      dailyLossLimitPct,
      cooldownMinutes: undefined,
      maxOpenOrders: undefined,
    });
    return NextResponse.json(result, result.ok ? undefined : { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Settings update failed' }, { status: 500 });
  }
}
