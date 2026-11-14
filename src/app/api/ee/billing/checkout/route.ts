// POST /api/ee/billing/checkout — create a real NOWPayments invoice.
// Enforces VN domestic crypto-checkout block (HTTP 451 per Law 71/2025/QH15 & Decree 284/2026/ND-CP),
// cross-workspace anti-IDOR (HTTP 403), and canonical server-side tier pricing.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/client';
import {
  detectCrossWorkspaceIdor,
  resolveEffectiveWorkspaceId,
  resolveWorkspaceTierContext,
  type WorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';
import {
  ensureUserWorkspaceMembership,
  ensureWorkspaceMembership,
} from '@/ee/tenancy/workspace-membership';
import { SaasTierSchema, type SaasTier } from '@/ee/tenancy/tenant-policy';
import { SAAS_TIER_ENTITLEMENTS } from '@/ee/billing/tier-entitlements';
import { defaultCheckoutOrderStore } from '@/ee/billing/checkout-order-store';
import { createNowPaymentsInvoice } from '@/ee/billing/nowpayments-invoice-client';
import { inspectVnCryptoCheckoutBlock } from '@/ee/billing/vn-jurisdiction-guard';

const CheckoutBodySchema = z.object({
  targetTier: SaasTierSchema,
  payCurrency: z.string().min(2).max(10).optional(),
  billingCountry: z.string().trim().min(2).max(16).optional(),
  workspaceId: z.string().trim().min(1).optional(),
});

async function resolveCheckoutWorkspace(
  req: Request,
  userId: string | undefined,
  tierContext: WorkspaceTierContext,
): Promise<string | undefined> {
  const resolvedWorkspaceId = tierContext.workspaceId;
  const db = createServerClient() ?? undefined;
  if (!resolvedWorkspaceId && userId && db) {
    const provisioned = await ensureUserWorkspaceMembership(userId, db);
    return provisioned.workspaceId;
  }
  if (resolvedWorkspaceId && userId && db) {
    await ensureWorkspaceMembership(userId, resolvedWorkspaceId, 'OWNER', db);
  }
  return resolveEffectiveWorkspaceId(req, resolvedWorkspaceId);
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

    // Gate G11 (§12.1.3 & §15.2): Block domestic VN cryptocurrency checkout with HTTP 451
    const vnCheck = inspectVnCryptoCheckoutBlock(req, parsedBody.billingCountry);
    if (vnCheck.blocked) {
      return NextResponse.json(
        {
          ok: false,
          code: vnCheck.code,
          jurisdiction: vnCheck.jurisdiction,
          source: vnCheck.source,
          messageEn: vnCheck.messageEn,
          messageVi: vnCheck.messageVi,
          error: vnCheck.error,
        },
        { status: vnCheck.status },
      );
    }

    const targetTier: SaasTier = parsedBody.targetTier;
    if (targetTier === 'BASIC') {
      return NextResponse.json(
        { ok: false, error: 'UPGRADE_TARGET_INVALID: BASIC is the free tier and cannot be purchased' },
        { status: 400 },
      );
    }

    const tierContext = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: parsedBody.workspaceId,
    });
    const idor = detectCrossWorkspaceIdor(req, tierContext, parsedBody.workspaceId);
    if (idor) {
      return NextResponse.json(
        { ok: false, code: idor.code, error: idor.error },
        { status: idor.status },
      );
    }

    const userId = req.headers.get('x-user-id')?.trim() || undefined;
    const workspaceId = await resolveCheckoutWorkspace(req, userId, tierContext);
    if (!workspaceId) {
      return NextResponse.json(
        { ok: false, error: 'WORKSPACE_UNRESOLVED: no workspace is bound to this session' },
        { status: 401 },
      );
    }

    const priceUsd = SAAS_TIER_ENTITLEMENTS[targetTier].priceUsdMonthly;
    const payCurrency = (parsedBody.payCurrency ?? 'usd').toLowerCase();

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
      return NextResponse.json({ ok: false, error: invoice.error }, { status: 503 });
    }

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
