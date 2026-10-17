// Step 14 HTTP Endpoint: GET /api/ee/alpha-feed
// Returns pre-computed IC/IR survival leaderboards filtered by workspace SaaS tier.

import { NextResponse } from 'next/server';
import { getCloudAlphaFeedForTier } from '@/ee/alpha-cloud/alpha-feed-service';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import { SaasTierSchema, type SaasTier } from '@/ee/tenancy/tenant-policy';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const queryTier = url.searchParams.get('tier')?.toUpperCase();
    const headerTier = req.headers.get('x-cashclaw-tier')?.toUpperCase();
    const workspaceId =
      url.searchParams.get('workspaceId') ?? req.headers.get('x-cashclaw-workspace');

    const rawTier = queryTier ?? headerTier;
    if (rawTier) {
      const parsed = SaasTierSchema.safeParse(rawTier);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: `Invalid SaaS tier: ${rawTier}` },
          { status: 400 },
        );
      }
      const items = getCloudAlphaFeedForTier(parsed.data);
      return NextResponse.json({
        ok: true,
        tier: parsed.data,
        safetyMode: 'PAPER_ADVISORY_ONLY',
        count: items.length,
        items,
      });
    }

    const resolvedTier: SaasTier = workspaceId
      ? await defaultSaasEntitlementStore.getWorkspaceTier(workspaceId)
      : 'BASIC';
    const items = getCloudAlphaFeedForTier(resolvedTier);

    return NextResponse.json({
      ok: true,
      tier: resolvedTier,
      workspaceId: workspaceId ?? 'default',
      safetyMode: 'PAPER_ADVISORY_ONLY',
      count: items.length,
      items,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to load Cloud Alpha Feed' },
      { status: 500 },
    );
  }
}
