import { NextResponse } from 'next/server';
import {
  type SignedCloudSyncBundle,
  verifyAndImportCloudSyncBundle,
} from '@/ee/sync/local-to-cloud-sync';
import { enforceWorkspaceQuota } from '@/ee/billing/quota-guard';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import { SaasTierSchema, type SaasTier } from '@/ee/tenancy/tenant-policy';

export async function POST(req: Request) {
  try {
    const rawTier = req.headers.get('x-cashclaw-tier')?.toUpperCase();
    const parsedTier = rawTier ? SaasTierSchema.safeParse(rawTier) : undefined;
    const workspaceId = req.headers.get('x-cashclaw-workspace');
    const tier: SaasTier = parsedTier?.success
      ? parsedTier.data
      : workspaceId
        ? await defaultSaasEntitlementStore.getWorkspaceTier(workspaceId)
        : 'BASIC';

    const activeBotsHeader = parseInt(req.headers.get('x-cashclaw-active-bots') ?? '0', 10);
    const activeRunningBots = Number.isNaN(activeBotsHeader) ? 0 : Math.max(0, activeBotsHeader);

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
