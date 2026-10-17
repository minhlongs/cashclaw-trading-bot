import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCloudAlphaFeedForTier } from '@/ee/alpha-cloud/alpha-feed-service';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import { SaasTierSchema } from '@/ee/tenancy/tenant-policy';

const QuerySchema = z.object({
  tier: SaasTierSchema.default('BASIC'),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      tier: url.searchParams.get('tier') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid tier parameter' },
        { status: 400 },
      );
    }

    const entitlements = getEntitlementsForTier(parsed.data.tier);
    const feed = getCloudAlphaFeedForTier(parsed.data.tier);
    return NextResponse.json({
      ok: true,
      tier: parsed.data.tier,
      fullFeedAccess: entitlements.cloudAlphaFeedAccess,
      itemCount: feed.length,
      feed,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
