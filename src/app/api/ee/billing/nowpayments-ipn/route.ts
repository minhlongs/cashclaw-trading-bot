import { NextResponse } from 'next/server';
import { verifyNowPaymentsIpnHttpRequest } from '@/ee/billing/nowpayments-ipn-verifier';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';

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
