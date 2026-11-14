import { NextResponse } from 'next/server';
import { handleNowPaymentsIpnPost } from '@/ee/billing/nowpayments-ipn-handler';

export async function POST(req: Request) {
  try {
    return await handleNowPaymentsIpnPost(req, { includeProcessedFlag: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to process IPN webhook' },
      { status: 500 },
    );
  }
}
