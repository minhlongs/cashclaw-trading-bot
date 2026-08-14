// GET /api/bots — list all bots (user-facing, session-cookie auth via middleware)
// POST /api/bots — create a new bot (user-facing, session-cookie auth via middleware)
//
// This is the canonical /api/bots for end users.
// Operator/CLI access via Bearer token lives in src/worker.ts → /internal/api/bots.
import { NextResponse } from 'next/server';
import { botListHandler, botCreateHandler, type CreateBotPayload } from '@/forest/api/routes';
import { checkRateLimit, getRateLimitHeaders } from '@/forest/api/rate-limiter';
import { z } from 'zod';

const CreateBotSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  strategy: z.enum(['grid', 'mean_reversion']),
  pair: z.string().min(1).max(20),
  exchange: z.enum(['binance', 'bybit', 'okx']),
  capital: z.number().positive().max(1_000_000),
  mode: z.enum(['paper', 'live']).optional().default('paper'),
  gridConfig: z.object({
    lowerPrice: z.number().positive(),
    upperPrice: z.number().positive(),
    gridCount: z.number().int().min(2).max(200),
  }).optional(),
  meanRevConfig: z.object({
    period: z.number().int().min(2).max(200),
    stdDev: z.number().positive().max(5),
  }).optional(),
});

export async function GET() {
  const result = await botListHandler();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const rateLimit = checkRateLimit('bots:create');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = CreateBotSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map(i => i.message).join(', ') },
      { status: 400 }
    );
  }

  const body = parsed.data as CreateBotPayload;
  const result = await botCreateHandler(body);
  return NextResponse.json(result, result.ok ? undefined : { status: 400 });
}
