import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  defaultCreditLedgerStore,
  type DeliberationModelTier,
} from '@/ee/deliberation-cloud/llm-credit-ledger';
import {
  detectCrossWorkspaceIdor,
  resolveEffectiveWorkspaceId,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';

const QuerySchema = z.object({
  workspaceId: z.string().trim().min(1).optional(),
});

const DebitSchema = z.object({
  workspaceId: z.string().trim().min(1).optional(),
  modelTier: z.enum(['FAST', 'REASONING', 'LOCAL']),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawWorkspace = url.searchParams.get('workspaceId');
    const parsed = QuerySchema.safeParse({
      workspaceId: rawWorkspace && rawWorkspace.trim().length > 0 ? rawWorkspace : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid workspaceId' }, { status: 400 });
    }

    const tierContext = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: parsed.data.workspaceId,
    });
    const idor = detectCrossWorkspaceIdor(req, tierContext, parsed.data.workspaceId);
    if (idor) {
      return NextResponse.json(
        { ok: false, code: idor.code, error: idor.error },
        { status: idor.status },
      );
    }

    const effectiveWorkspaceId = resolveEffectiveWorkspaceId(
      req,
      tierContext.workspaceId,
      parsed.data.workspaceId,
    );
    if (!effectiveWorkspaceId) {
      return NextResponse.json({ ok: false, error: 'Invalid workspaceId' }, { status: 400 });
    }

    const account = defaultCreditLedgerStore.getOrCreateAccount(
      effectiveWorkspaceId,
      tierContext.tier,
    );
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

    const tierContext = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: parsed.data.workspaceId,
    });
    const idor = detectCrossWorkspaceIdor(req, tierContext, parsed.data.workspaceId);
    if (idor) {
      return NextResponse.json(
        { ok: false, code: idor.code, error: idor.error },
        { status: idor.status },
      );
    }

    const effectiveWorkspaceId = resolveEffectiveWorkspaceId(
      req,
      tierContext.workspaceId,
      parsed.data.workspaceId,
    );
    if (!effectiveWorkspaceId) {
      return NextResponse.json({ ok: false, error: 'Invalid workspaceId' }, { status: 400 });
    }

    const debitReq = {
      workspaceId: effectiveWorkspaceId,
      modelTier: parsed.data.modelTier as DeliberationModelTier,
      promptTokens: parsed.data.promptTokens,
      completionTokens: parsed.data.completionTokens,
    };

    const debitResult = defaultCreditLedgerStore.debit(debitReq, tierContext.tier);
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
