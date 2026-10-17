import { NextResponse } from 'next/server';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import { resolveWorkspaceTierContext } from '@/ee/tenancy/workspace-request-context';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const context = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: url.searchParams.get('workspaceId'),
      explicitTier: url.searchParams.get('tier'),
    });

    if (context.invalidExplicitTier) {
      return NextResponse.json(
        { ok: false, error: 'Invalid tier specified' },
        { status: 400 },
      );
    }

    const entitlements = getEntitlementsForTier(context.tier);
    return NextResponse.json({
      ok: true,
      workspaceId: context.workspaceId,
      tier: context.tier,
      entitlements,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
