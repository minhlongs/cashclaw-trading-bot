import { NextResponse } from 'next/server';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import { resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';

export async function GET(req: Request) {
  try {
    const context = await resolveWorkspaceTierContext(req);
    const entitlements = getEntitlementsForTier(context.tier);
    return NextResponse.json({
      ok: true,
      workspaceId: context.workspaceId,
      role: context.role,
      tier: context.tier,
      entitlementExpiresAtMs: context.entitlementExpiresAtMs,
      entitlements,
    });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}
