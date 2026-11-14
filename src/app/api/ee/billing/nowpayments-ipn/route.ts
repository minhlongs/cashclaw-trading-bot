import { NextResponse } from 'next/server';
import { handleNowPaymentsIpnPost } from '@/ee/billing/nowpayments-ipn-handler';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import {
  detectCrossWorkspaceIdor,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get('workspaceId')?.trim();
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: 'workspaceId is required' }, { status: 400 });
  }
  const ctx = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: workspaceId });
  const idor = detectCrossWorkspaceIdor(req, ctx, workspaceId);
  if (idor) {
    return NextResponse.json(
      { ok: false, code: idor.code, error: idor.error },
      { status: idor.status },
    );
  }
  const entitlement = await defaultSaasEntitlementStore.getWorkspaceEntitlement(workspaceId);
  return NextResponse.json({
    ok: true,
    entitlement,
  });
}

export async function POST(req: Request) {
  try {
    return await handleNowPaymentsIpnPost(req);
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to process NOWPayments IPN webhook' },
      { status: 500 },
    );
  }
}
