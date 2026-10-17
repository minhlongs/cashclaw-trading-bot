import { NextResponse } from 'next/server';
import {
  type SignedCloudSyncBundle,
  verifyAndImportCloudSyncBundle,
} from '@/ee/sync/local-to-cloud-sync';

export async function POST(req: Request) {
  try {
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
