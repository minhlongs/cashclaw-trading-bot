// GET /api/ee/alpha-feed returns workspace-tier filtered advisory data.

import { NextResponse } from 'next/server';
import { getCloudAlphaFeedForTier } from '@/ee/alpha-cloud/alpha-feed-service';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import { resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';

export async function GET(req: Request) {
  try {
    const context = await resolveWorkspaceTierContext(req);
    const entitlements = getEntitlementsForTier(context.tier);
    const items = getCloudAlphaFeedForTier(context.tier);
    return NextResponse.json({
      ok: true,
      tier: context.tier,
      workspaceId: context.workspaceId,
      safetyMode: 'PAPER_ADVISORY_ONLY',
      fullFeedAccess: entitlements.cloudAlphaFeedAccess,
      count: items.length,
      itemCount: items.length,
      items,
      feed: items,
    });
  } catch (error) {
    const response = workspaceContextErrorResponse(error);
    if (response.status === 503) return response;
    return NextResponse.json({ ok: false, error: 'Failed to load Cloud Alpha Feed' }, { status: response.status });
  }
}
