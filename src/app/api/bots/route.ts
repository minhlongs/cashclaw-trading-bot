import { NextResponse } from 'next/server';
import { botListHandler, botCreateHandler } from '@/forest/api/routes';
import { checkRateLimit, getRateLimitHeaders } from '@/forest/api/rate-limiter';
import { hashBotCreateRequest, markBotReservationCreated, releaseBotReservation, reserveWorkspaceBotSlot } from '@/ee/billing/bot-quota-reservations';
import { resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';
import { z } from 'zod';

const createBotConfigSchema = z.object({
  spacingPct: z.number().positive().max(100).optional(), gridLevels: z.number().int().min(2).max(500).optional(),
  capitalPerLevelPct: z.number().positive().max(100).optional(), takeProfitPct: z.number().positive().max(100).optional(),
  stopLossPct: z.number().positive().max(100).optional(), maxDrawdownPct: z.number().positive().max(100).optional(),
  priceDropStep: z.number().positive().max(100).optional(), maxSteps: z.number().int().min(2).max(100).optional(),
  baseOrderSizePct: z.number().positive().max(100).optional(), volatilityWindow: z.number().int().min(2).max(500).optional(),
  volBaseline: z.number().positive().max(500).optional(), reboundTarget: z.number().positive().max(100).optional(),
  quantExecution: z.union([z.boolean(), z.number()]).optional(),
});

const CreateBotSchema = z.object({
  id: z.string().min(1).max(64), name: z.string().min(1).max(128),
  strategy: z.enum(['grid', 'mean_reversion', 'volatility_dca']), pair: z.string().min(1).max(20),
  exchange: z.enum(['binance', 'bybit', 'okx']), capital: z.number().positive().max(1_000_000),
  mode: z.enum(['paper', 'live']).optional().default('paper'), config: createBotConfigSchema.optional(),
  gridConfig: z.object({ lowerPrice: z.number().positive(), upperPrice: z.number().positive(), gridCount: z.number().int().min(2).max(200) }).optional(),
  meanRevConfig: z.object({ period: z.number().int().min(2).max(200), stdDev: z.number().positive().max(5) }).optional(),
  workspaceId: z.string().min(1).max(128).optional(),
}).strict();

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const context = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: url.searchParams.get('workspaceId') });
    const result = await botListHandler(context.workspaceId);
    return NextResponse.json(result, result.ok ? undefined : { status: 503 });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const rateLimit = checkRateLimit('bots:create');
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: 'Rate limit exceeded' }, {
    status: 429, headers: getRateLimitHeaders(rateLimit),
  });

  try {
    const parsed = CreateBotSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid bot payload' }, { status: 400 });
    if (parsed.data.mode !== 'paper') return NextResponse.json({ ok: false, error: 'Paper mode only' }, { status: 400 });

    const context = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: parsed.data.workspaceId });
    if (!['OWNER', 'ADMIN', 'TRADER'].includes(context.role)) {
      return NextResponse.json({ ok: false, error: 'Workspace role cannot create bots' }, { status: 403 });
    }
    const requestHash = await hashBotCreateRequest(parsed.data);
    const reservation = await reserveWorkspaceBotSlot(context, parsed.data.id, requestHash);
    if (reservation.kind === 'quota_exceeded') {
      return NextResponse.json({ ok: false, error: 'QUOTA_EXCEEDED: bot limit reached', tier: context.tier }, { status: 403 });
    }
    if (reservation.kind === 'in_progress') {
      return NextResponse.json({ ok: false, error: 'Bot creation is already in progress' }, { status: 409 });
    }
    if (reservation.kind === 'idempotency_conflict') {
      return NextResponse.json({ ok: false, error: 'Bot ID was used by a different create request' }, { status: 409 });
    }
    if (reservation.kind === 'created') {
      return NextResponse.json({ ok: true, data: { id: parsed.data.id }, workspaceId: context.workspaceId, idempotentReplay: true });
    }

    try {
      const result = await botCreateHandler(parsed.data, { userId: context.userId, workspaceId: context.workspaceId });
      if (!result.ok) {
        await releaseBotReservation(context.db, parsed.data.id, context.userId);
        return NextResponse.json(result, { status: result.status ?? 400 });
      }
    } catch (error) {
      await releaseBotReservation(context.db, parsed.data.id, context.userId);
      throw error;
    }
    await markBotReservationCreated(context.db, parsed.data.id, context.userId);
    return NextResponse.json({ ok: true, data: { id: parsed.data.id }, workspaceId: context.workspaceId, tier: context.tier }, { status: 201 });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}
