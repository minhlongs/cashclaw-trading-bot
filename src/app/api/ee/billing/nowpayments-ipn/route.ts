import { NextResponse } from 'next/server';
import { verifyNowPaymentsIpnHttpRequest } from '@/ee/billing/nowpayments-ipn-verifier';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import { defaultCheckoutOrderStore } from '@/ee/billing/checkout-order-store';
import { resolveWorkspaceTierContext } from '@/ee/tenancy/workspace-request-context';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get('workspaceId')?.trim();
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: 'workspaceId is required' }, { status: 400 });
  }
  if (req.headers.get('x-user-id')?.trim()) {
    const ctx = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: workspaceId });
    if (ctx.workspaceId !== workspaceId) {
      return NextResponse.json(
        { ok: false, error: 'WORKSPACE_FORBIDDEN: workspace is not bound to this session' },
        { status: 403 },
      );
    }
  }
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

    const { payment_id, payment_status, order_id, pay_amount, pay_currency } = verification.payload;
    // The tier and workspace come from the order the server created at checkout.
    // The callback's own fields are not read: NOWPayments does not send them, so
    // anything in them was put there by the sender.
    const decisionResult = await defaultCheckoutOrderStore.resolveTierDecision(order_id);
    const decision = decisionResult.ok ? decisionResult.data : undefined;

    if (await defaultSaasEntitlementStore.hasProcessedPayment(payment_id)) {
      return NextResponse.json({
        ok: true,
        activated: false,
        idempotentReplay: true,
        paymentId: payment_id,
        targetTier: decision?.targetTier,
        workspaceId: decision?.workspaceId,
      });
    }

    const isActivated = payment_status === 'finished' || payment_status === 'confirmed';

    if (!decision) {
      // A callback for an order this server never issued. Refusing is the safe
      // response: there is no checkout that says which tier was bought, so any
      // activation would be guessing.
      return NextResponse.json(
        { ok: false, error: `IPN_ORDER_UNKNOWN: no checkout order matches order_id ${order_id}` },
        { status: 409 },
      );
    }

    const isUsdPegged = ['usd', 'usdt', 'usdc'].includes(pay_currency.toLowerCase());
    if (isActivated && isUsdPegged && pay_amount < decision.expectedAmountUsd) {
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

    if (isActivated) {
      await defaultCheckoutOrderStore.markPaid(order_id, payment_id);
    }

    return NextResponse.json({
      ok: true,
      activated: isActivated,
      idempotentReplay: false,
      paymentId: payment_id,
      status: payment_status,
      targetTier: decision.targetTier,
      workspaceId: decision.workspaceId,
      entitlement,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to process NOWPayments IPN webhook' },
      { status: 500 },
    );
  }
}
