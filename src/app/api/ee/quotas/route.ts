import { NextResponse } from 'next/server';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import {
  auditAllTiersSubscriberCogs,
  auditTierSubscriberCogs,
} from '@/ee/billing/subscriber-cogs-auditor';
import {
  detectCrossWorkspaceIdor,
  resolveEffectiveWorkspaceId,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';

export async function GET(req: Request) {
  try {
    const context = await resolveWorkspaceTierContext(req);
    const idor = detectCrossWorkspaceIdor(req, context);
    if (idor) {
      return NextResponse.json(
        { ok: false, code: idor.code, error: idor.error },
        { status: idor.status },
      );
    }

    const url = new URL(req.url);
    const includeFleetCogs = url.searchParams.get('includeCogsMatrix') === '1';
    const effectiveWorkspaceId = resolveEffectiveWorkspaceId(req, context.workspaceId);
    const entitlements = getEntitlementsForTier(context.tier);
    const unitEconomics = auditTierSubscriberCogs(context.tier);

    return NextResponse.json({
      ok: true,
      workspaceId: effectiveWorkspaceId,
      tier: context.tier,
      entitlements,
      unitEconomics,
      ...(includeFleetCogs ? { fleetCogsReport: auditAllTiersSubscriberCogs() } : {}),
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
