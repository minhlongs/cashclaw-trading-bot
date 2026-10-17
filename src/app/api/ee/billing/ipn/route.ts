import { NextResponse } from 'next/server';
import { verifyNowPaymentsIpnHttpRequest } from '@/ee/billing/nowpayments-ipn-verifier';

export async function POST(req: Request) {
  try {
    const verification = await verifyNowPaymentsIpnHttpRequest(req);
    if (!verification.ok) {
      return NextResponse.json(
        { ok: false, error: verification.error },
        { status: verification.status },
      );
    }

    return NextResponse.json({
      ok: true,
      processed: true,
      paymentId: verification.payload.payment_id,
      status: verification.payload.payment_status,
      targetTier: verification.payload.target_tier,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to process IPN webhook' },
      { status: 500 },
    );
  }
}
