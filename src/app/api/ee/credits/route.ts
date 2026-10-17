import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createCreditAccount,
  computeDebateCreditCost,
  debitDeliberationCredits,
  type DeliberationModelTier,
} from '@/ee/deliberation-cloud/llm-credit-ledger';
import { SaasTierSchema } from '@/ee/tenancy/tenant-policy';

const QuerySchema = z.object({
  workspaceId: z.string().min(1),
  tier: SaasTierSchema.default('BASIC'),
});

const DebitSchema = z.object({
  workspaceId: z.string().min(1),
  tier: SaasTierSchema.default('BASIC'),
  modelTier: z.enum(['FAST', 'REASONING', 'LOCAL']),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      workspaceId: url.searchParams.get('workspaceId') ?? '',
      tier: url.searchParams.get('tier') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid workspaceId or tier' },
        { status: 400 },
      );
    }

    const account = createCreditAccount(parsed.data.workspaceId, parsed.data.tier);
    return NextResponse.json({
      ok: true,
      account,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = DebitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid debit payload', details: parsed.error.format() },
        { status: 400 },
      );
    }

    const debitReq = {
      workspaceId: parsed.data.workspaceId,
      modelTier: parsed.data.modelTier as DeliberationModelTier,
      promptTokens: parsed.data.promptTokens,
      completionTokens: parsed.data.completionTokens,
    };

    const account = createCreditAccount(parsed.data.workspaceId, parsed.data.tier);
    const debitResult = debitDeliberationCredits(account, debitReq);

    if (!debitResult.ok) {
      return NextResponse.json(
        { ok: false, error: debitResult.error },
        { status: 402 },
      );
    }

    const costCredits = computeDebateCreditCost(debitReq);

    return NextResponse.json({
      ok: true,
      workspaceId: parsed.data.workspaceId,
      modelTier: parsed.data.modelTier,
      costCredits,
      account: debitResult.data.updated,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
