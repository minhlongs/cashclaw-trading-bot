import { NextResponse } from 'next/server';
import { getWorkspaceEntitlementForOwner } from '@/ee/billing/nowpayments-order-store';
import { handleNowPaymentsIpn } from './handler';
import { resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const context = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: url.searchParams.get('workspaceId') ?? undefined,
    });
    const entitlement = await getWorkspaceEntitlementForOwner(context.db, context.workspaceId, context.userId);
    if (!entitlement) return NextResponse.json({ ok: false, error: 'Workspace entitlement not found' }, { status: 404 });
    return NextResponse.json({
      ok: true,
      workspaceId: context.workspaceId,
      tier: entitlement.tier,
      expiresAtMs: entitlement.expiresAtMs,
      revoked: entitlement.revoked,
    });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}

export async function POST(req: Request) {
  return handleNowPaymentsIpn(req);
}
