// Cloudflare D1 SQL persistence helpers for saas_checkout_orders (migration 0016).
// Extracted from the checkout store to keep each module single-purpose.

import type { D1Database } from '@/lib/db/types';
import type { SaasTier } from '../tenancy/tenant-policy';

/** The decision the server made when it created the invoice. This is the only
 *  authority for which workspace a payment upgrades and to which tier — the IPN
 *  callback cannot name either. */
export interface CheckoutOrderRow {
  readonly orderId: string;
  readonly workspaceId: string;
  readonly userId?: string;
  readonly targetTier: SaasTier;
  readonly expectedAmountUsd: number;
  readonly payCurrency: string;
  readonly invoiceId?: string;
  readonly invoiceUrl?: string;
  readonly paymentId?: string;
  readonly status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

interface D1CheckoutOrderRecord {
  order_id: string;
  workspace_id: string;
  user_id: string | null;
  target_tier: string;
  expected_amount_usd: number;
  pay_currency: string;
  invoice_id: string | null;
  invoice_url: string | null;
  payment_id: string | null;
  status: string;
  created_at_ms: number;
  updated_at_ms: number;
}

function toRow(record: D1CheckoutOrderRecord): CheckoutOrderRow {
  return {
    orderId: record.order_id,
    workspaceId: record.workspace_id,
    userId: record.user_id ?? undefined,
    targetTier: record.target_tier as SaasTier,
    expectedAmountUsd: Number(record.expected_amount_usd),
    payCurrency: record.pay_currency,
    invoiceId: record.invoice_id ?? undefined,
    invoiceUrl: record.invoice_url ?? undefined,
    paymentId: record.payment_id ?? undefined,
    status: record.status as CheckoutOrderRow['status'],
    createdAtMs: Number(record.created_at_ms),
    updatedAtMs: Number(record.updated_at_ms),
  };
}

export async function insertD1CheckoutOrder(db: D1Database, row: CheckoutOrderRow): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO saas_checkout_orders
       (order_id, workspace_id, user_id, target_tier, expected_amount_usd, pay_currency,
        invoice_id, invoice_url, payment_id, status, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.orderId, row.workspaceId, row.userId ?? null, row.targetTier, row.expectedAmountUsd,
      row.payCurrency, row.invoiceId ?? null, row.invoiceUrl ?? null, row.paymentId ?? null,
      row.status, row.createdAtMs, row.updatedAtMs,
    )
    .run();
}

export async function fetchD1CheckoutOrder(
  db: D1Database,
  orderId: string,
): Promise<CheckoutOrderRow | undefined> {
  const record = await db
    .prepare('SELECT * FROM saas_checkout_orders WHERE order_id = ?')
    .bind(orderId)
    .first<D1CheckoutOrderRecord>();
  return record ? toRow(record) : undefined;
}

/** Records the provider's payment id against the order once it is known, so a
 *  later IPN for the same order can be correlated with the checkout that made
 *  it. Called on repeated deliveries too; the write is idempotent. */
export async function markD1CheckoutOrderPaid(
  db: D1Database,
  orderId: string,
  paymentId: string,
  nowMs: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE saas_checkout_orders
          SET payment_id = ?, status = 'PAID', updated_at_ms = ?
        WHERE order_id = ?`,
    )
    .bind(paymentId, nowMs, orderId)
    .run();
}
