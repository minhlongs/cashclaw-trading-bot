import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultCreditLedgerStore, type DeliberationModelTier } from '@/ee/deliberation-cloud/llm-credit-ledger';
import { resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';

const QuerySchema = z.object({ workspaceId: z.string().min(1).optional() });
const DebitSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  modelTier: z.enum(['FAST', 'REASONING', 'LOCAL']),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
});

export async function GET(req: Request) {
  try {
    const parsed = QuerySchema.safeParse({ workspaceId: new URL(req.url).searchParams.get('workspaceId') ?? undefined });
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid workspaceId' }, { status: 400 });
    const context = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: parsed.data.workspaceId });
    const account = defaultCreditLedgerStore.getOrCreateAccount(context.workspaceId, context.tier);
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = DebitSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid debit payload', details: parsed.error.format() }, { status: 400 });
    }
    const context = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: parsed.data.workspaceId });
    const debitResult = defaultCreditLedgerStore.debit({
      workspaceId: context.workspaceId,
      modelTier: parsed.data.modelTier as DeliberationModelTier,
      promptTokens: parsed.data.promptTokens,
      completionTokens: parsed.data.completionTokens,
    }, context.tier);
    if (!debitResult.ok) return NextResponse.json({ ok: false, error: debitResult.error }, { status: 402 });
    return NextResponse.json({
      ok: true,
      workspaceId: context.workspaceId,
      modelTier: parsed.data.modelTier,
      costCredits: debitResult.data.debited,
      account: debitResult.data.updated,
    });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}
