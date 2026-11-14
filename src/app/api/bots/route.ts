import { NextResponse } from 'next/server';
import { botListHandler, botCreateHandler } from '@/forest/api/routes';
import { evaluateBotStrategyGuard } from '@/forest/api/handlers/bot-strategy-guard';
import { checkRateLimit, getRateLimitHeaders } from '@/forest/api/rate-limiter';
import { enforceWorkspaceQuota } from '@/ee/billing/quota-guard';
import {
  detectCrossWorkspaceIdor,
  resolveActiveBotCount,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';
import { z } from 'zod';

const createBotConfigSchema = z.object({
  spacingPct: z.number().positive().max(100).optional(),
  spacing_pct: z.number().positive().max(100).optional(),
  gridLevels: z.number().int().min(2).max(500).optional(),
  levels: z.number().int().min(2).max(500).optional(),
  capitalPerLevelPct: z.number().positive().max(100).optional(),
  capital_per_level_pct: z.number().positive().max(100).optional(),
  takeProfitPct: z.number().positive().max(100).optional(),
  stopLossPct: z.number().positive().max(100).optional(),
  maxDrawdownPct: z.number().positive().max(100).optional(),
  max_drawdown_pct: z.number().positive().max(100).optional(),
  bb_period: z.number().int().min(2).max(500).optional(),
  bb_std: z.number().positive().max(20).optional(),
  rsi_period: z.number().int().min(2).max(500).optional(),
  rsi_buy: z.number().positive().max(100).optional(),
  rsi_sell: z.number().positive().max(100).optional(),
  volume_multiplier: z.number().positive().max(50).optional(),
  position_size_pct: z.number().positive().max(100).optional(),
  priceDropStep: z.number().positive().max(100).optional(),
  maxSteps: z.number().int().min(2).max(100).optional(),
  baseOrderSizePct: z.number().positive().max(100).optional(),
  volatilityWindow: z.number().int().min(2).max(500).optional(),
  volBaseline: z.number().positive().max(500).optional(),
  reboundTarget: z.number().positive().max(100).optional(),
  quantExecution: z.union([z.boolean(), z.number()]).optional(),
  lookbackDays: z.number().int().min(2).max(180).optional(),
  entryAnnualBps: z.number().positive().max(5000).optional(),
  exitAnnualBps: z.number().nonnegative().max(2000).optional(),
  maxGrossLeverage: z.number().positive().max(1.5).optional(),
});

const CreateBotSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  strategy: z.enum(['grid', 'mean_reversion', 'volatility_dca', 'h3_maker']),
  pair: z.string().min(1).max(20),
  exchange: z.enum(['binance', 'bybit', 'okx']),
  capital: z.number().positive().max(1_000_000),
  mode: z.enum(['paper', 'live']).optional().default('paper'),
  config: createBotConfigSchema.optional(),
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

export async function GET(req?: Request) {
  const userId = req?.headers.get('x-user-id')?.trim() || undefined;
  const result = userId ? await botListHandler(userId) : await botListHandler();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const userId = req.headers?.get?.('x-user-id')?.trim() || undefined;
  const rateLimitKey = userId ? `bots:create:${userId}` : 'bots:create';
  const rateLimit = checkRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  const raw = await req.json().catch(() => ({}));
  const rawRecord = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const strategyGuard = evaluateBotStrategyGuard(rawRecord.strategy);
  if (strategyGuard && !strategyGuard.ok) {
    return NextResponse.json(
      { ok: false, code: strategyGuard.code, error: strategyGuard.error },
      { status: strategyGuard.status },
    );
  }

  const parsed = CreateBotSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map(i => i.message).join(', ') },
      { status: 400 }
    );
  }

  const tierContext = await resolveWorkspaceTierContext(req);
  const idorViolation = detectCrossWorkspaceIdor(req, tierContext);
  if (idorViolation) {
    return NextResponse.json(
      { ok: false, code: idorViolation.code, error: idorViolation.error },
      { status: idorViolation.status },
    );
  }
  const { tier } = tierContext;
  const currentBotCount = await resolveActiveBotCount(() =>
    userId ? botListHandler(userId) : botListHandler(),
  );

  const quotaCheck = enforceWorkspaceQuota({
    tier,
    activeRunningBots: currentBotCount,
    requestedWalkForwardWindows: 1,
  });
  if (!quotaCheck.ok) {
    return NextResponse.json({ ok: false, error: quotaCheck.error }, { status: 403 });
  }

  const result = userId
    ? await botCreateHandler(parsed.data, userId)
    : await botCreateHandler(parsed.data);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status === 403 ? 403 : 400 });
  }
  return NextResponse.json(result);
}
