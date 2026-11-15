import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { z } from 'zod';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
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
  allowNegativeRoiResearch: z.boolean().optional().default(false),
});

function readServerAdminToken(): string | null {
  try {
    const { env } = getCloudflareContext();
    const bound = (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
    if (typeof bound === 'string' && bound.trim().length >= 8 && !/\s/.test(bound.trim())) {
      return bound.trim();
    }
  } catch {
    // Fallback to process.env outside Cloudflare request context
  }
  const proc = typeof process !== 'undefined' ? process.env.ADMIN_TOKEN : undefined;
  if (typeof proc === 'string' && proc.trim().length >= 8 && !/\s/.test(proc.trim())) {
    return proc.trim();
  }
  return null;
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

async function hasServerResearchAuthorization(req: Request): Promise<boolean> {
  const expected = readServerAdminToken();
  if (!expected) return false;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const supplied = authHeader.slice('Bearer '.length);
  if (!supplied) return false;
  const [suppliedHash, expectedHash] = await Promise.all([
    sha256Bytes(supplied),
    sha256Bytes(expected),
  ]);
  let diff = 0;
  for (let i = 0; i < expectedHash.length; i += 1) {
    diff |= suppliedHash[i]! ^ expectedHash[i]!;
  }
  return diff === 0;
}

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
      return NextResponse.json({ ok: false, code: idor.code, error: idor.error }, { status: idor.status });
    }

    const effectiveWorkspaceId = resolveEffectiveWorkspaceId(
      req, tierContext.workspaceId, parsed.data.workspaceId,
    );
    if (!effectiveWorkspaceId) {
      return NextResponse.json({ ok: false, error: 'Invalid workspaceId' }, { status: 400 });
    }

    const account = defaultCreditLedgerStore.getOrCreateAccount(effectiveWorkspaceId, tierContext.tier);
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
      return NextResponse.json({ ok: false, code: idor.code, error: idor.error }, { status: idor.status });
    }

    const effectiveWorkspaceId = resolveEffectiveWorkspaceId(
      req, tierContext.workspaceId, parsed.data.workspaceId,
    );
    if (!effectiveWorkspaceId) {
      return NextResponse.json({ ok: false, error: 'Invalid workspaceId' }, { status: 400 });
    }

    const entitlements = getEntitlementsForTier(tierContext.tier);
    if (!entitlements.managedLlmPoolAllowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'MANAGED_LLM_POOL_FORBIDDEN',
          tier: tierContext.tier,
          error: `Managed LLM credit pool requires PREMIUM or higher (current tier: ${tierContext.tier}). Use BYOK local configuration instead.`,
        },
        { status: 403 },
      );
    }

    const serverAuthorizedOverride =
      parsed.data.allowNegativeRoiResearch === true && (await hasServerResearchAuthorization(req));
    if (parsed.data.modelTier === 'REASONING' && !serverAuthorizedOverride) {
      return NextResponse.json(
        {
          ok: false,
          code: 'MULTI_AGENT_DEBATE_DISABLED_NEGATIVE_ROI',
          error:
            'Multi-agent REASONING debate is disabled by default per Gate G12 ablation (-$89.68 net ROI drag). Requires server operator authorization for manual offline critique.',
        },
        { status: 403 },
      );
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
      ...(parsed.data.modelTier === 'REASONING' && serverAuthorizedOverride
        ? { researchOverrideApplied: true }
        : {}),
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
