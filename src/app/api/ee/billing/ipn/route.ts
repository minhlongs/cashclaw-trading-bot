import { NextResponse } from 'next/server';
import { verifyNowPaymentsIpnHttpRequest } from '@/ee/billing/nowpayments-ipn-verifier';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';

export async function POST(req: Request) {
  try {
    const verification = await verifyNowPaymentsIpnHttpRequest(req);
    if (!verification.ok) {
      return NextResponse.json(
        { ok: false, error: verification.error },
        { status: verification.status },
      );
    }

    const {
      payment_id,
      payment_status,
      target_tier,
      workspace_id,
      pay_amount,
      pay_currency,
    } = verification.payload;

    if (await defaultSaasEntitlementStore.hasProcessedPayment(payment_id)) {
      return NextResponse.json({
        ok: true,
        processed: true,
        activated: false,
        idempotentReplay: true,
        paymentId: payment_id,
        status: payment_status,
        targetTier: target_tier,
        workspaceId: workspace_id,
      });
    }

    const activated = payment_status === 'finished' || payment_status === 'confirmed';
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
      processed: true,
      activated,
      idempotentReplay: false,
      paymentId: payment_id,
      status: payment_status,
      targetTier: target_tier,
      workspaceId: workspace_id,
      entitlement,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to process IPN webhook' },
      { status: 500 },
    );
  }
}
