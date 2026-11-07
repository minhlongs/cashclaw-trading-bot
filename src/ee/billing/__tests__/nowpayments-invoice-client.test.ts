// The invoice client is the only thing in the repo that talks to the NOWPayments
// invoice API. Two properties are load-bearing: a missing key must fail closed
// with a named error (a fake invoice would take money without recording it), and
// the key must travel as a header rather than a query string.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PAYMENT_PROVIDER_UNAVAILABLE,
  createNowPaymentsInvoice,
  hasInvoiceCapability,
} from '../nowpayments-invoice-client';

function invoiceResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const validRequest = {
  priceAmount: 29,
  priceCurrency: 'usd' as const,
  orderId: 'ws:ws_a:abc123',
  orderDescription: 'CashClaw PREMIUM subscription',
};

describe('createNowPaymentsInvoice', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NOWPAYMENTS_API_KEY', 'stub-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns the hosted invoice URL for a created invoice', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      invoiceResponse({
        id: 5001,
        invoice_url: 'https://nowpayments.io/invoice/abc123',
        order_id: 'ws:ws_a:abc123',
      }),
    );

    const result = await createNowPaymentsInvoice(validRequest);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.invoiceUrl).toBe('https://nowpayments.io/invoice/abc123');
      expect(result.data.invoiceId).toBe('5001');
      expect(result.data.orderId).toBe('ws:ws_a:abc123');
    }
  });

  it('sends the API key as a header, never in the URL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(invoiceResponse({ id: 1, invoice_url: 'https://nowpayments.io/invoice/x' }));

    await createNowPaymentsInvoice(validRequest);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.nowpayments.io/v1/invoice');
    expect(String(url)).not.toContain('stub-api-key');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('stub-api-key');
  });

  it('fails closed with a named error when no API key is configured', async () => {
    vi.stubEnv('NOWPAYMENTS_API_KEY', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await createNowPaymentsInvoice(validRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(PAYMENT_PROVIDER_UNAVAILABLE);
    // Not reaching the network at all is the point: there is nothing to send.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(hasInvoiceCapability()).toBe(false);
  });

  it('treats a whitespace-only key as absent', async () => {
    vi.stubEnv('NOWPAYMENTS_API_KEY', '   ');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await createNowPaymentsInvoice(validRequest);

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces the provider rejection reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      invoiceResponse({ message: 'Invalid API key' }, 401),
    );

    const result = await createNowPaymentsInvoice(validRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('PAYMENT_PROVIDER_REJECTED');
      expect(result.error).toContain('Invalid API key');
    }
  });

  it('reports an unreachable provider distinctly from a rejected one', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));

    const result = await createNowPaymentsInvoice(validRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('PAYMENT_PROVIDER_UNREACHABLE');
  });

  it('rejects a 200 that carries no invoice URL', async () => {
    // A provider that answers OK but gives no invoice would otherwise be treated
    // as success, leaving the customer with nowhere to pay.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(invoiceResponse({ id: 7 }));

    const result = await createNowPaymentsInvoice(validRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('PAYMENT_PROVIDER_MALFORMED');
  });

  it('falls back to the request order id when the provider omits its echo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      invoiceResponse({ id: 9, invoice_url: 'https://nowpayments.io/invoice/9' }),
    );

    const result = await createNowPaymentsInvoice(validRequest);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.orderId).toBe('ws:ws_a:abc123');
  });

  it('sends the price the caller decided and nothing the caller did not', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(invoiceResponse({ id: 3, invoice_url: 'https://nowpayments.io/invoice/3' }));

    await createNowPaymentsInvoice({
      ...validRequest,
      payCurrency: 'usdttrc20',
      ipnCallbackUrl: 'https://cashclaw.test/api/ee/billing/ipn',
    });

    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({
      price_amount: 29,
      price_currency: 'usd',
      order_id: 'ws:ws_a:abc123',
      pay_currency: 'usdttrc20',
      ipn_callback_url: 'https://cashclaw.test/api/ee/billing/ipn',
    });
  });
});
