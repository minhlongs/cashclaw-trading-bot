// Shared HTTP IPN Webhook Processor for /api/ee/billing/nowpayments-ipn and /api/ee/billing/ipn
// Enforces HMAC-SHA512, 300s timestamp window, server-recorded CheckoutOrder lookup,
// non-activation on partially_paid/waiting/failed/expired, underpayment rejection,
// and atomic in-flight + persisted replay defense across 10x parallel bursts.

import { NextResponse } from 'next/server';
import { verifyNowPaymentsIpnHttpRequest } from './nowpayments-ipn-verifier';
import {
  detectNowPaymentsUnderpayment,
  isActivatingIpnStatus,
  type NowPaymentsIpnPayload,
} from './nowpayments-ipn';
import { defaultSaasEntitlementStore } from './saas-entitlement-store';
import { defaultCheckoutOrderStore } from './checkout-order-store';
import type { CheckoutOrderRow } from './checkout-order-d1';

function buildReplayResponse(
  payload: NowPaymentsIpnPayload,
  decision: CheckoutOrderRow | undefined,
  extraBase: Record<string, boolean>,
): NextResponse {
  return NextResponse.json({
    ok: true,
    ...extraBase,
    activated: false,
    duplicate: true,
    idempotentReplay: true,
    paymentId: payload.payment_id,
    status: payload.payment_status,
    targetTier: decision?.targetTier,
    workspaceId: decision?.workspaceId,
  });
}

async function handleNonActivatingIpn(
  payload: NowPaymentsIpnPayload,
  decision: CheckoutOrderRow | undefined,
  extraBase: Record<string, boolean>,
): Promise<NextResponse> {
  if (await defaultSaasEntitlementStore.hasProcessedPayment(payload.payment_id)) {
    return buildReplayResponse(payload, decision, extraBase);
  }
  if (!decision) {
    return NextResponse.json(
      { ok: false, error: `IPN_ORDER_UNKNOWN: no checkout order matches order_id ${payload.order_id}` },
      { status: 409 },
    );
  }
  const ownerUserId =
    decision.userId ?? (await defaultSaasEntitlementStore.resolveWorkspaceOwner(decision.workspaceId));
  const entitlement = await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
    paymentId: payload.payment_id,
    workspaceId: decision.workspaceId,
    ownerUserId,
    targetTier: decision.targetTier,
    paymentStatus: payload.payment_status,
    payAmount: payload.pay_amount,
    payCurrency: payload.pay_currency,
  });
  return NextResponse.json({
    ok: true,
    ...extraBase,
    activated: false,
    duplicate: false,
    idempotentReplay: false,
    paymentId: payload.payment_id,
    status: payload.payment_status,
    targetTier: decision.targetTier,
    workspaceId: decision.workspaceId,
    entitlement,
  });
}

export async function handleNowPaymentsIpnPost(
  req: Request,
  options?: { readonly includeProcessedFlag?: boolean },
): Promise<NextResponse> {
  const verification = await verifyNowPaymentsIpnHttpRequest(req);
  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, error: verification.error },
      { status: verification.status },
    );
  }

  const payload = verification.payload;
  const extraBase: Record<string, boolean> = options?.includeProcessedFlag ? { processed: true } : {};
  const decisionResult = await defaultCheckoutOrderStore.resolveTierDecision(payload.order_id);
  const decision = decisionResult.ok ? decisionResult.data : undefined;

  if (!isActivatingIpnStatus(payload.payment_status)) {
    return handleNonActivatingIpn(payload, decision, extraBase);
  }

  if (!decision) {
    if (await defaultSaasEntitlementStore.hasProcessedPayment(payload.payment_id)) {
      return buildReplayResponse(payload, undefined, extraBase);
    }
    return NextResponse.json(
      { ok: false, error: `IPN_ORDER_UNKNOWN: no checkout order matches order_id ${payload.order_id}` },
      { status: 409 },
    );
  }

  const underpaymentError = detectNowPaymentsUnderpayment(payload, decision.expectedAmountUsd);
  if (underpaymentError) {
    return NextResponse.json({ ok: false, error: underpaymentError }, { status: 409 });
  }

  const claim = await defaultSaasEntitlementStore.tryClaimPaymentActivation(
    payload.payment_id,
    payload.order_id,
  );
  if (claim === 'DUPLICATE' || decision.status === 'PAID') {
    if (claim === 'ACQUIRED') {
      defaultSaasEntitlementStore.finalizePaymentClaim(payload.payment_id, payload.order_id, true);
    }
    return buildReplayResponse(payload, decision, extraBase);
  }

  try {
    const ownerUserId =
      decision.userId ?? (await defaultSaasEntitlementStore.resolveWorkspaceOwner(decision.workspaceId));
    const entitlement = await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: payload.payment_id,
      workspaceId: decision.workspaceId,
      ownerUserId,
      targetTier: decision.targetTier,
      paymentStatus: payload.payment_status,
      payAmount: payload.pay_amount,
      payCurrency: payload.pay_currency,
    });
    await defaultCheckoutOrderStore.markPaid(payload.order_id, payload.payment_id);
    defaultSaasEntitlementStore.finalizePaymentClaim(payload.payment_id, payload.order_id, true);

    return NextResponse.json({
      ok: true,
      ...extraBase,
      activated: true,
      duplicate: false,
      idempotentReplay: false,
      paymentId: payload.payment_id,
      status: payload.payment_status,
      targetTier: decision.targetTier,
      workspaceId: decision.workspaceId,
      entitlement,
    });
  } catch (cause) {
    defaultSaasEntitlementStore.finalizePaymentClaim(payload.payment_id, payload.order_id, false);
    throw cause;
  }
}
