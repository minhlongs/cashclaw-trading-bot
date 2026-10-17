import { NextResponse } from 'next/server';
import {
  NowPaymentsIpnPayloadSchema,
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '@/ee/billing/nowpayments-ipn';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-nowpayments-sig');

    if (!signature) {
      return NextResponse.json(
        { ok: false, error: 'Missing x-nowpayments-sig header' },
        { status: 401 },
      );
    }

    const secret = process.env.NOWPAYMENTS_IPN_SECRET || 'test_ipn_secret';
    let parsedJson: Record<string, unknown>;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const canonicalJson = canonicalizeNowPaymentsJson(parsedJson);
    const expectedSig = await computeNowPaymentsHmacSha512(canonicalJson, secret);

    if (expectedSig !== signature) {
      return NextResponse.json(
        { ok: false, error: 'Invalid HMAC signature' },
        { status: 403 },
      );
    }

    const validated = NowPaymentsIpnPayloadSchema.safeParse(parsedJson);
    if (!validated.success) {
      return NextResponse.json(
        { ok: false, error: validated.error.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      processed: true,
      paymentId: validated.data.payment_id,
      status: validated.data.payment_status,
      targetTier: validated.data.target_tier,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to process IPN webhook' },
      { status: 500 },
    );
  }
}
