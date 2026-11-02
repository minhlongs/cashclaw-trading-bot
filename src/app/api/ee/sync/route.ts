import { NextResponse } from 'next/server';
import { type SignedCloudSyncBundle, verifyAndImportCloudSyncBundle } from '@/ee/sync/local-to-cloud-sync';
import { enforceWorkspaceQuota } from '@/ee/billing/quota-guard';
import { resolveActiveBotCount, resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';

export async function POST(req: Request) {
  try {
    const context = await resolveWorkspaceTierContext(req);
    if (!['OWNER', 'ADMIN', 'TRADER'].includes(context.role)) {
      return NextResponse.json({ ok: false, error: 'Workspace role cannot import bots' }, { status: 403 });
    }
    const activeRunningBots = await resolveActiveBotCount(context);
    const quotaCheck = enforceWorkspaceQuota({ tier: context.tier, activeRunningBots, requestedWalkForwardWindows: 1 });
    if (!quotaCheck.ok) return NextResponse.json({ ok: false, error: quotaCheck.error }, { status: 403 });

    const rawBundle = (await req.json()) as SignedCloudSyncBundle;
    const importResult = await verifyAndImportCloudSyncBundle(rawBundle);
    if (!importResult.ok) return NextResponse.json({ ok: false, error: importResult.error }, { status: 422 });
    return NextResponse.json({
      ok: true, imported: true, workspaceId: context.workspaceId, tier: context.tier,
      botName: importResult.data.botName, strategyId: importResult.data.strategyId, symbol: importResult.data.symbol,
    });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}
