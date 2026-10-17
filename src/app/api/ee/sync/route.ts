import { NextResponse } from 'next/server';
import {
  type SignedCloudSyncBundle,
  verifyAndImportCloudSyncBundle,
} from '@/ee/sync/local-to-cloud-sync';
import { enforceWorkspaceQuota } from '@/ee/billing/quota-guard';
import {
  resolveActiveBotCount,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';
import { botListHandler } from '@/forest/api/routes';

export async function POST(req: Request) {
  try {
    const { tier } = await resolveWorkspaceTierContext(req);
    const activeRunningBots = await resolveActiveBotCount(req, botListHandler);

    const quotaCheck = enforceWorkspaceQuota({
      tier,
      activeRunningBots,
      requestedWalkForwardWindows: 1,
    });
    if (!quotaCheck.ok) {
      return NextResponse.json(
        { ok: false, error: quotaCheck.error },
        { status: 403 },
      );
    }

    const rawBundle = (await req.json()) as SignedCloudSyncBundle;
    const importResult = await verifyAndImportCloudSyncBundle(rawBundle);

    if (!importResult.ok) {
      return NextResponse.json(
        { ok: false, error: importResult.error },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      imported: true,
      tier,
      botName: importResult.data.botName,
      strategyId: importResult.data.strategyId,
      symbol: importResult.data.symbol,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error while importing bundle' },
      { status: 500 },
    );
  }
}
