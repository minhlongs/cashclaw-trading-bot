// NOWPayments invoice creation.
//
// Reads the API key from the edge binding first and `process.env` only outside a
// request context. There is no default key: a literal in a public repo would let
// anyone create invoices against the merchant account.

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { err, ok, type Result } from '@/lib/result';

export const PAYMENT_PROVIDER_UNAVAILABLE =
  'PAYMENT_PROVIDER_UNAVAILABLE: NOWPayments API key is not configured';

const INVOICE_ENDPOINT = 'https://api.nowpayments.io/v1/invoice';

/** NowPayments returns a broad, loosely-typed body; read only the fields this
 *  client needs and treat everything else as absent. */
interface NowPaymentsInvoiceResponse {
  readonly id?: string | number;
  readonly invoice_url?: string;
  readonly order_id?: string;
  readonly message?: string;
}

export interface CreateInvoiceInput {
  readonly priceAmount: number;
  readonly priceCurrency: 'usd';
  readonly orderId: string;
  readonly orderDescription: string;
  readonly payCurrency?: string;
  readonly ipnCallbackUrl?: string;
  readonly successUrl?: string;
  readonly cancelUrl?: string;
}

export interface CreatedInvoice {
  readonly invoiceId: string;
  readonly invoiceUrl: string;
  readonly orderId: string;
}

function readApiKey(): string | null {
  try {
    const { env } = getCloudflareContext();
    const fromBinding = (env as unknown as { NOWPAYMENTS_API_KEY?: string }).NOWPAYMENTS_API_KEY;
    if (fromBinding && fromBinding.trim().length > 0) return fromBinding.trim();
  } catch {
    // No request context (unit tests, plain Node) — fall through to process.env.
  }
  const fromProcessEnv = typeof process !== 'undefined' ? process.env.NOWPAYMENTS_API_KEY : undefined;
  if (fromProcessEnv && fromProcessEnv.trim().length > 0) return fromProcessEnv.trim();
  return null;
}

export function hasInvoiceCapability(): boolean {
  return readApiKey() !== null;
}

export async function createNowPaymentsInvoice(
  input: CreateInvoiceInput,
): Promise<Result<CreatedInvoice>> {
  const apiKey = readApiKey();
  if (!apiKey) return err(PAYMENT_PROVIDER_UNAVAILABLE);

  const body: Record<string, unknown> = {
    price_amount: input.priceAmount,
    price_currency: input.priceCurrency,
    order_id: input.orderId,
    order_description: input.orderDescription,
  };
  if (input.payCurrency) body.pay_currency = input.payCurrency;
  if (input.ipnCallbackUrl) body.ipn_callback_url = input.ipnCallbackUrl;
  if (input.successUrl) body.success_url = input.successUrl;
  if (input.cancelUrl) body.cancel_url = input.cancelUrl;

  let response: Response;
  try {
    response = await fetch(INVOICE_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return err(`PAYMENT_PROVIDER_UNREACHABLE: ${(cause as Error).message}`);
  }

  const raw = (await response.json().catch(() => null)) as NowPaymentsInvoiceResponse | null;
  if (!response.ok) {
    const reason = raw?.message ?? `HTTP ${response.status}`;
    return err(`PAYMENT_PROVIDER_REJECTED: ${reason}`);
  }
  if (!raw?.invoice_url || raw.id === undefined) {
    return err('PAYMENT_PROVIDER_MALFORMED: response carried no invoice_url');
  }

  return ok({
    invoiceId: String(raw.id),
    invoiceUrl: raw.invoice_url,
    orderId: raw.order_id ?? input.orderId,
  });
}
