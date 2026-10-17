import { NextResponse } from 'next/server';
import {
  NowPaymentsIpnPayloadSchema,
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '@/ee/billing/nowpayments-ipn';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';

const MAX_TIMESTAMP_AGE_SECONDS = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get('workspaceId') || 'default';
  const entitlement = await defaultSaasEntitlementStore.getWorkspaceEntitlement(workspaceId);
  return NextResponse.json({
    ok: true,
    entitlement,
  });
}

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('x-nowpayments-sig');
    if (!signature) {
      return NextResponse.json(
        { ok: false, error: 'Missing x-nowpayments-sig header' },
        { status: 401 },
      );
    }

    const timestampHeader = req.headers.get('x-nowpayments-timestamp');
    if (timestampHeader) {
      const sentTime = parseInt(timestampHeader, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      if (Number.isNaN(sentTime) || Math.abs(currentTime - sentTime) > MAX_TIMESTAMP_AGE_SECONDS) {
        return NextResponse.json(
          { ok: false, error: 'Timestamp outside 300s anti-replay tolerance window' },
          { status: 403 },
        );
      }
    }

    const rawBody = await req.text();
    let parsedJson: Record<string, unknown>;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const secret = process.env.NOWPAYMENTS_IPN_SECRET || 'test_ipn_secret';
    const canonicalJson = canonicalizeNowPaymentsJson(parsedJson);
    const expectedSig = await computeNowPaymentsHmacSha512(canonicalJson, secret);

    if (expectedSig !== signature.trim().toLowerCase()) {
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

    const {
      payment_id,
      payment_status,
      target_tier,
      workspace_id,
      pay_amount,
      pay_currency,
    } = validated.data;

    // Idempotency check against D1 + in-memory store
    if (await defaultSaasEntitlementStore.hasProcessedPayment(payment_id)) {
      return NextResponse.json({
        ok: true,
        activated: false,
        idempotentReplay: true,
        paymentId: payment_id,
        targetTier: target_tier,
        workspaceId: workspace_id,
      });
    }

    const isActivated = payment_status === 'finished' || payment_status === 'confirmed';
    const entitlement = await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: payment_id,
      workspaceId: workspace_id,
      targetTier: target_tier,
      paymentStatus: payment_status,
      payAmount: pay_amount,
      payCurrency: pay_currency,
    });

    return NextResponse.json({
      ok: true,
      activated: isActivated,
      idempotentReplay: false,
      paymentId: payment_id,
      status: payment_status,
      targetTier: target_tier,
      workspaceId: workspace_id,
      entitlement,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to process NOWPayments IPN webhook' },
      { status: 500 },
    );
  }
}
