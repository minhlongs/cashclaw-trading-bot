// The checkout endpoint decides the price, never the client. These tests pin the
// three properties that make a real invoice safe to hand out: the tier must be
// purchasable, the workspace must come from the session, and the amount must come
// from the tier table rather than the request body.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from './route';
import { defaultCheckoutOrderStore } from '@/ee/billing/checkout-order-store';
import { SAAS_TIER_ENTITLEMENTS } from '@/ee/billing/tier-entitlements';
import type { Result } from '@/lib/result';

const createInvoice = vi.fn<(input: Record<string, unknown>) => Promise<Result<Record<string, unknown>>>>();
const resolveWorkspace = vi.fn<(req: Request) => Promise<{ workspaceId: string | undefined; tier: string }>>();

vi.mock('@/ee/billing/nowpayments-invoice-client', () => ({
  createNowPaymentsInvoice: (input: Record<string, unknown>) => createInvoice(input),
}));

vi.mock('@/ee/tenancy/workspace-request-context', () => ({
  resolveWorkspaceTierContext: (req: Request) => resolveWorkspace(req),
}));

/** A request shaped like the middleware leaves it: the session-verified user id
 *  is already on the header and the workspace follows from membership. */
function checkoutRequest(body: unknown, userId = 'usr_session_buyer'): Request {
  return new Request('http://localhost/api/ee/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify(body),
  });
}

function stubInvoice(orderId = 'ws:ws_session_buyer:abc123'): void {
  createInvoice.mockResolvedValue({
    ok: true,
    data: {
      invoiceId: 'inv_5001',
      invoiceUrl: 'https://nowpayments.io/invoice/inv_5001',
      orderId,
    },
  });
}

describe('POST /api/ee/billing/checkout', () => {
  beforeEach(() => {
    createInvoice.mockReset();
    defaultCheckoutOrderStore.resetMemoryForTesting();
    resolveWorkspace.mockReset();
    resolveWorkspace.mockResolvedValue({ workspaceId: 'ws_session_buyer', tier: 'BASIC' });
    stubInvoice();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    defaultCheckoutOrderStore.resetMemoryForTesting();
  });

  it('creates an invoice and returns the hosted payment URL', async () => {
    const res = await POST(checkoutRequest({ targetTier: 'PREMIUM' }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.invoiceUrl).toBe('https://nowpayments.io/invoice/inv_5001');
    expect(body.orderId).toBe('ws:ws_session_buyer:abc123');
    expect(body.targetTier).toBe('PREMIUM');
  });

  it('prices the invoice from the tier table, not from the request', async () => {
    await POST(
      checkoutRequest({
        targetTier: 'ENTERPRISE',
        // A client-supplied amount must have no effect on what is charged.
        priceAmount: 1,
        amount: 1,
        priceUsd: 1,
      }),
    );

    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(createInvoice.mock.calls[0][0]).toMatchObject({
      priceAmount: SAAS_TIER_ENTITLEMENTS.ENTERPRISE.priceUsdMonthly,
      priceCurrency: 'usd',
    });
  });

  it('refuses BASIC, because it is the free tier', async () => {
    const res = await POST(checkoutRequest({ targetTier: 'BASIC' }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.error)).toContain('BASIC');
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('rejects a body whose tier is not a real tier', async () => {
    const res = await POST(checkoutRequest({ targetTier: 'PLATINUM' }));

    expect(res.status).toBe(400);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('records the order before answering, so the IPN can find it', async () => {
    await POST(checkoutRequest({ targetTier: 'MASTER' }));

    const recorded = await defaultCheckoutOrderStore.getOrder('ws:ws_session_buyer:abc123');
    expect(recorded).toBeDefined();
    expect(recorded?.workspaceId).toBe('ws_session_buyer');
    expect(recorded?.targetTier).toBe('MASTER');
    expect(recorded?.expectedAmountUsd).toBe(SAAS_TIER_ENTITLEMENTS.MASTER.priceUsdMonthly);
  });

  it('refuses when the session resolves to no workspace', async () => {
    resolveWorkspace.mockResolvedValueOnce({ workspaceId: undefined, tier: 'BASIC' });

    const res = await POST(checkoutRequest({ targetTier: 'PREMIUM' }));

    expect(res.status).toBe(401);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('surfaces a provider refusal as 503, not a fake success', async () => {
    createInvoice.mockResolvedValue({
      ok: false,
      error: 'PAYMENT_PROVIDER_UNAVAILABLE: NOWPayments API key is not configured',
    });

    const res = await POST(checkoutRequest({ targetTier: 'PREMIUM' }));

    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.error)).toContain('PAYMENT_PROVIDER_UNAVAILABLE');
    // Nothing was recorded, so no stray order can later be matched by an IPN.
    const recorded = await defaultCheckoutOrderStore.getOrder('ws:ws_session_buyer:abc123');
    expect(recorded).toBeUndefined();
  });

  it('does not record an order when the provider rejects the invoice', async () => {
    createInvoice.mockResolvedValue({ ok: false, error: 'PAYMENT_PROVIDER_REJECTED: bad key' });

    await POST(checkoutRequest({ targetTier: 'PREMIUM' }));

    const recorded = await defaultCheckoutOrderStore.getOrder('ws:ws_session_buyer:abc123');
    expect(recorded).toBeUndefined();
  });

  it('embeds the workspace in the order id so the invoice is traceable', async () => {
    await POST(checkoutRequest({ targetTier: 'PREMIUM' }));

    const body = await POST(checkoutRequest({ targetTier: 'PREMIUM' }));
    expect(body.status).toBe(200);
    const ordered = createInvoice.mock.calls[1][0];
    expect(String(ordered.orderId)).toMatch(/^ws:ws_session_buyer:[0-9a-f]{16}$/);
  });
});
