import { NextResponse } from 'next/server';
import { verifyNowPaymentsIpnHttpRequest } from '@/ee/billing/nowpayments-ipn-verifier';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import { defaultCheckoutOrderStore } from '@/ee/billing/checkout-order-store';

export async function POST(req: Request) {
  try {
    const verification = await verifyNowPaymentsIpnHttpRequest(req);
    if (!verification.ok) {
      return NextResponse.json(
        { ok: false, error: verification.error },
        { status: verification.status },
      );
    }

    const { payment_id, payment_status, order_id, pay_amount, pay_currency } = verification.payload;
    // Tier and workspace come from the checkout order the server issued, not from
    // the callback body.
    const decisionResult = await defaultCheckoutOrderStore.resolveTierDecision(order_id);
    const decision = decisionResult.ok ? decisionResult.data : undefined;

    if (await defaultSaasEntitlementStore.hasProcessedPayment(payment_id)) {
      return NextResponse.json({
        ok: true,
        processed: true,
        activated: false,
        idempotentReplay: true,
        paymentId: payment_id,
        status: payment_status,
        targetTier: decision?.targetTier,
        workspaceId: decision?.workspaceId,
      });
    }

    if (!decision) {
      return NextResponse.json(
        { ok: false, error: `IPN_ORDER_UNKNOWN: no checkout order matches order_id ${order_id}` },
        { status: 409 },
      );
    }

    const activated = payment_status === 'finished' || payment_status === 'confirmed';
    const isUsdPegged = ['usd', 'usdt', 'usdc'].includes(pay_currency.toLowerCase());
    if (activated && isUsdPegged && pay_amount < decision.expectedAmountUsd) {
      return NextResponse.json(
        {
          ok: false,
          error: `IPN_AMOUNT_MISMATCH: paid ${pay_amount} ${pay_currency} < expected ${decision.expectedAmountUsd} USD`,
        },
        { status: 409 },
      );
    }

    // Prefer the session user recorded on the checkout order, falling back to
    // the workspace's existing OWNER row in saas_workspace_members.
    const ownerUserId =
      decision.userId ?? (await defaultSaasEntitlementStore.resolveWorkspaceOwner(decision.workspaceId));
    const entitlement = await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: payment_id,
      workspaceId: decision.workspaceId,
      ownerUserId,
      targetTier: decision.targetTier,
      paymentStatus: payment_status,
      payAmount: pay_amount,
      payCurrency: pay_currency,
    });

    if (activated) {
      await defaultCheckoutOrderStore.markPaid(order_id, payment_id);
    }

    return NextResponse.json({
      ok: true,
      processed: true,
      activated,
      idempotentReplay: false,
      paymentId: payment_id,
      status: payment_status,
      targetTier: decision.targetTier,
      workspaceId: decision.workspaceId,
      entitlement,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to process IPN webhook' },
      { status: 500 },
    );
  }
}
