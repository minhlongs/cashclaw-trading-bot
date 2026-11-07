// POST /api/ee/billing/checkout — create a real NOWPayments invoice.
//
// The price comes from the canonical tier table, never from the request, and the
// order (which workspace buys which tier, for how much) is recorded server-side
// before the customer is redirected. The IPN path later reads that record instead
// of trusting the callback payload, so a valid signature proves only that
// NOWPayments sent the callback — not that the tier it names was bought.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/client';
import { resolveWorkspaceTierContext } from '@/ee/tenancy/workspace-request-context';
import {
  ensureUserWorkspaceMembership,
  ensureWorkspaceMembership,
} from '@/ee/tenancy/workspace-membership';
import { SaasTierSchema, type SaasTier } from '@/ee/tenancy/tenant-policy';
import { SAAS_TIER_ENTITLEMENTS } from '@/ee/billing/tier-entitlements';
import { defaultCheckoutOrderStore } from '@/ee/billing/checkout-order-store';
import { createNowPaymentsInvoice } from '@/ee/billing/nowpayments-invoice-client';

const CheckoutBodySchema = z.object({
  targetTier: SaasTierSchema,
  payCurrency: z.string().min(2).max(10).optional(),
});

async function resolveCheckoutWorkspace(
  req: Request,
  userId: string | undefined,
): Promise<string | undefined> {
  const { workspaceId: resolvedWorkspaceId } = await resolveWorkspaceTierContext(req);
  const db = createServerClient() ?? undefined;
  if (!resolvedWorkspaceId && userId && db) {
    const provisioned = await ensureUserWorkspaceMembership(userId, db);
    return provisioned.workspaceId;
  }
  if (resolvedWorkspaceId && userId && db) {
    await ensureWorkspaceMembership(userId, resolvedWorkspaceId, 'OWNER', db);
  }
  return resolvedWorkspaceId;
}

export async function POST(req: Request) {
  try {
    let parsedBody: z.infer<typeof CheckoutBodySchema>;
    try {
      parsedBody = CheckoutBodySchema.parse(await req.json());
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid checkout payload: expected { targetTier, payCurrency? }' },
        { status: 400 },
      );
    }

    const targetTier: SaasTier = parsedBody.targetTier;
    // BASIC is the free tier. Charging money to stay on the free tier is not a
    // real purchase, so the endpoint refuses it rather than creating an invoice.
    if (targetTier === 'BASIC') {
      return NextResponse.json(
        { ok: false, error: 'UPGRADE_TARGET_INVALID: BASIC is the free tier and cannot be purchased' },
        { status: 400 },
      );
    }

    // The workspace comes from the session-verified identity, not from the body.
    // A brand-new user with no membership row yet has a personal workspace
    // provisioned on first checkout (phase-03 step 6) when D1 is available.
    const userId = req.headers.get('x-user-id')?.trim() || undefined;
    const workspaceId = await resolveCheckoutWorkspace(req, userId);
    if (!workspaceId) {
      return NextResponse.json(
        { ok: false, error: 'WORKSPACE_UNRESOLVED: no workspace is bound to this session' },
        { status: 401 },
      );
    }

    // Price decided here, from the canonical table. A client-sent amount would let
    // anyone buy MASTER for one cent.
    const priceUsd = SAAS_TIER_ENTITLEMENTS[targetTier].priceUsdMonthly;
    const payCurrency = (parsedBody.payCurrency ?? 'usd').toLowerCase();

    // order_id embeds the workspace so the invoice can be traced back without a
    // lookup, and a random suffix so two checkout attempts never collide. The
    // workspace id is encoded because it is not guaranteed to be
    // punctuation-free.
    const encodedWorkspace = encodeURIComponent(workspaceId);
    const uniqueSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const orderId = `ws:${encodedWorkspace}:${uniqueSuffix}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const ipnCallbackUrl = appUrl
      ? `${appUrl.replace(/\/$/, '')}/api/ee/billing/nowpayments-ipn`
      : undefined;

    const invoice = await createNowPaymentsInvoice({
      priceAmount: priceUsd,
      priceCurrency: 'usd',
      orderId,
      orderDescription: `CashClaw ${targetTier} subscription for workspace ${workspaceId}`,
      payCurrency,
      ipnCallbackUrl,
    });

    if (!invoice.ok) {
      // 503 rather than 500: the request was valid, the provider is not usable.
      // The manual-payment fallback in the client keys off this status.
      return NextResponse.json({ ok: false, error: invoice.error }, { status: 503 });
    }

    // Record before returning the URL. If the IPN arrives before this write is
    // durable, the callback would name an order the server does not know and be
    // refused — losing a real customer's payment.
    await defaultCheckoutOrderStore.recordOrder({
      orderId: invoice.data.orderId,
      workspaceId,
      userId,
      targetTier,
      expectedAmountUsd: priceUsd,
      payCurrency,
      invoiceId: invoice.data.invoiceId,
      invoiceUrl: invoice.data.invoiceUrl,
    });

    return NextResponse.json({
      ok: true,
      invoiceUrl: invoice.data.invoiceUrl,
      invoiceId: invoice.data.invoiceId,
      paymentId: invoice.data.invoiceId,
      orderId: invoice.data.orderId,
      targetTier,
      workspaceId,
      priceUsd,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to create checkout invoice' }, { status: 500 });
  }
}
