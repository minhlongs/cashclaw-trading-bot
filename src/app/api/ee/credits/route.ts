import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { z } from 'zod';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import { defaultCreditLedgerStore, type DeliberationModelTier } from '@/ee/deliberation-cloud/llm-credit-ledger';
import type { SaasTier } from '@/ee/tenancy/tenant-policy';
import {
  detectCrossWorkspaceIdor,
  requireAuthenticatedUser,
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

function validTokenOrNull(raw?: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length >= 8 && !/\s/.test(trimmed) ? trimmed : null;
}

function readServerAdminToken(): string | null {
  try {
    const { env } = getCloudflareContext();
    const bound = validTokenOrNull((env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN);
    if (bound) return bound;
  } catch {
    // Fallback to process.env outside Cloudflare request context
  }
  return validTokenOrNull(typeof process !== 'undefined' ? process.env.ADMIN_TOKEN : undefined);
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function hasServerResearchAuthorization(req: Request): Promise<boolean> {
  const expected = readServerAdminToken();
  const authHeader = req.headers.get('authorization') ?? '';
  if (!expected || !authHeader.startsWith('Bearer ')) return false;
  const supplied = authHeader.slice('Bearer '.length);
  if (!supplied) return false;
  const [suppliedHash, expectedHash] = await Promise.all([sha256Bytes(supplied), sha256Bytes(expected)]);
  let diff = 0;
  for (let i = 0; i < expectedHash.length; i += 1) diff |= suppliedHash[i]! ^ expectedHash[i]!;
  return diff === 0;
}

const INVALID_WORKSPACE_ERROR = 'Invalid workspaceId';
const INTERNAL_SERVER_ERROR = 'Internal server error';

function negativeRoiForbiddenResponse() {
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

export async function GET(req: Request) {
  try {
    const auth = requireAuthenticatedUser(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, code: auth.violation.code, error: auth.violation.error },
        { status: auth.violation.status },
      );
    }

    const url = new URL(req.url);
    const rawWorkspace = url.searchParams.get('workspaceId');
    const parsed = QuerySchema.safeParse({
      workspaceId: rawWorkspace && rawWorkspace.trim().length > 0 ? rawWorkspace : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: INVALID_WORKSPACE_ERROR }, { status: 400 });
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
      return NextResponse.json({ ok: false, error: INVALID_WORKSPACE_ERROR }, { status: 400 });
    }

    const account = defaultCreditLedgerStore.getOrCreateAccount(effectiveWorkspaceId, tierContext.tier);
    return NextResponse.json({ ok: true, account });
  } catch {
    return NextResponse.json({ ok: false, error: INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}

function executeCreditDebit(
  effectiveWorkspaceId: string,
  tier: SaasTier,
  data: z.infer<typeof DebitSchema>,
  serverAuthorizedOverride: boolean,
) {
  if (!getEntitlementsForTier(tier).managedLlmPoolAllowed) {
    return NextResponse.json(
      {
        ok: false,
        code: 'MANAGED_LLM_POOL_FORBIDDEN',
        tier,
        error: `Managed LLM credit pool requires PREMIUM or higher (current tier: ${tier}). Use BYOK local configuration instead.`,
      },
      { status: 403 },
    );
  }
  if (data.modelTier === 'REASONING' && !serverAuthorizedOverride) {
    return negativeRoiForbiddenResponse();
  }
  const debitResult = defaultCreditLedgerStore.debit(
    {
      workspaceId: effectiveWorkspaceId,
      modelTier: data.modelTier as DeliberationModelTier,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
    },
    tier,
  );
  if (!debitResult.ok) {
    return NextResponse.json({ ok: false, error: debitResult.error }, { status: 402 });
  }
  return NextResponse.json({
    ok: true,
    workspaceId: effectiveWorkspaceId,
    modelTier: data.modelTier,
    costCredits: debitResult.data.debited,
    account: debitResult.data.updated,
    ...(data.modelTier === 'REASONING' && serverAuthorizedOverride ? { researchOverrideApplied: true } : {}),
  });
}

export async function POST(req: Request) {
  try {
    const parsed = DebitSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid debit payload', details: parsed.error.format() },
        { status: 400 },
      );
    }

    const auth = requireAuthenticatedUser(req);
    const serverAuthorizedOverride =
      parsed.data.allowNegativeRoiResearch === true && (await hasServerResearchAuthorization(req));
    if (!auth.ok && !serverAuthorizedOverride) {
      return parsed.data.modelTier === 'REASONING'
        ? negativeRoiForbiddenResponse()
        : NextResponse.json({ ok: false, code: auth.violation.code, error: auth.violation.error }, { status: auth.violation.status });
    }

    const tierContext = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: parsed.data.workspaceId,
      trustedServerOperator: serverAuthorizedOverride,
    });
    if (auth.ok) {
      const idor = detectCrossWorkspaceIdor(req, tierContext, parsed.data.workspaceId);
      if (idor) {
        return NextResponse.json({ ok: false, code: idor.code, error: idor.error }, { status: idor.status });
      }
    }

    const effectiveWorkspaceId = resolveEffectiveWorkspaceId(req, tierContext.workspaceId, parsed.data.workspaceId);
    if (!effectiveWorkspaceId) {
      return NextResponse.json({ ok: false, error: INVALID_WORKSPACE_ERROR }, { status: 400 });
    }
    return executeCreditDebit(effectiveWorkspaceId, tierContext.tier, parsed.data, serverAuthorizedOverride);
  } catch {
    return NextResponse.json({ ok: false, error: INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
