// Step 14 HTTP Endpoint: GET /api/ee/alpha-feed
// Returns pre-computed IC/IR survival leaderboards filtered by workspace SaaS tier.

import { NextResponse } from 'next/server';
import { getCloudAlphaFeedForTier } from '@/ee/alpha-cloud/alpha-feed-service';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import { resolveWorkspaceTierContext } from '@/ee/tenancy/workspace-request-context';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { workspaceId, tier, invalidExplicitTier } = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: url.searchParams.get('workspaceId'),
      explicitTier: url.searchParams.get('tier'),
    });

    if (invalidExplicitTier) {
      return NextResponse.json(
        { ok: false, error: `Invalid SaaS tier: ${invalidExplicitTier}` },
        { status: 400 },
      );
    }

    const entitlements = getEntitlementsForTier(tier);
    const items = getCloudAlphaFeedForTier(tier);
    return NextResponse.json({
      ok: true,
      tier,
      workspaceId: workspaceId ?? 'default',
      safetyMode: 'PAPER_ADVISORY_ONLY',
      fullFeedAccess: entitlements.cloudAlphaFeedAccess,
      count: items.length,
      itemCount: items.length,
      items,
      feed: items,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to load Cloud Alpha Feed' },
      { status: 500 },
    );
  }
}
