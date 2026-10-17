import { NextResponse } from 'next/server';
import { z } from 'zod';
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
        { ok: false, error: 'Invalid tier specified' },
        { status: 400 },
      );
    }

    const entitlements = getEntitlementsForTier(parsed.data.tier);
    return NextResponse.json({
      ok: true,
      tier: parsed.data.tier,
      entitlements,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
