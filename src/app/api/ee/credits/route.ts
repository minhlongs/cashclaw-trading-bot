import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  defaultCreditLedgerStore,
  type DeliberationModelTier,
} from '@/ee/deliberation-cloud/llm-credit-ledger';
import {
  resolveEffectiveWorkspaceId,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';

const QuerySchema = z.object({
  workspaceId: z.string().min(1),
});

const DebitSchema = z.object({
  workspaceId: z.string().min(1),
  modelTier: z.enum(['FAST', 'REASONING', 'LOCAL']),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      workspaceId: url.searchParams.get('workspaceId') ?? '',
    });
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid workspaceId' }, { status: 400 });
    }

    // The tier is read from the workspace's D1 entitlement, never from `?tier=`.
    const { workspaceId: resolvedWorkspaceId, tier: resolvedTier } =
      await resolveWorkspaceTierContext(req, {
        explicitWorkspaceId: parsed.data.workspaceId,
      });
    const effectiveWorkspaceId =
      resolveEffectiveWorkspaceId(req, resolvedWorkspaceId, parsed.data.workspaceId) ??
      parsed.data.workspaceId;

    const account = defaultCreditLedgerStore.getOrCreateAccount(effectiveWorkspaceId, resolvedTier);
    return NextResponse.json({ ok: true, account });
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
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

    // The tier is read from the workspace's D1 entitlement, never from the request body.
    const { workspaceId: resolvedWorkspaceId, tier: resolvedTier } =
      await resolveWorkspaceTierContext(req, {
        explicitWorkspaceId: parsed.data.workspaceId,
      });
    const effectiveWorkspaceId =
      resolveEffectiveWorkspaceId(req, resolvedWorkspaceId, parsed.data.workspaceId) ??
      parsed.data.workspaceId;

    const debitReq = {
      workspaceId: effectiveWorkspaceId,
      modelTier: parsed.data.modelTier as DeliberationModelTier,
      promptTokens: parsed.data.promptTokens,
      completionTokens: parsed.data.completionTokens,
    };

    const debitResult = defaultCreditLedgerStore.debit(debitReq, resolvedTier);
    if (!debitResult.ok) {
      return NextResponse.json({ ok: false, error: debitResult.error }, { status: 402 });
    }

    return NextResponse.json({
      ok: true,
      workspaceId: effectiveWorkspaceId,
      modelTier: parsed.data.modelTier,
      costCredits: debitResult.data.debited,
      account: debitResult.data.updated,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
