// Checkout order mapping: orderId -> the tier decision the server made.
//
// The order is written before the customer is redirected to the provider, so by
// the time an IPN callback arrives the server already knows what was bought and
// by whom. The callback carries only `order_id` back from the provider; it must
// not be trusted for the workspace or the tier.

import type { D1Database } from '@/lib/db/types';
import { createServerClient } from '@/lib/db/client';
import { err, ok, type Result } from '@/lib/result';
import type { SaasTier } from '../tenancy/tenant-policy';
import {
  fetchD1CheckoutOrder,
  insertD1CheckoutOrder,
  markD1CheckoutOrderPaid,
  type CheckoutOrderRow,
} from './checkout-order-d1';

export interface RecordCheckoutOrderInput {
  readonly orderId: string;
  readonly workspaceId: string;
  readonly userId?: string;
  readonly targetTier: SaasTier;
  readonly expectedAmountUsd: number;
  readonly payCurrency: string;
  readonly invoiceId?: string;
  readonly invoiceUrl?: string;
  readonly createdAtMs?: number;
}

export class CheckoutOrderStore {
  private db?: D1Database;
  private readonly memoryOrders = new Map<string, CheckoutOrderRow>();

  constructor(db?: D1Database) { this.db = db; }
  public setDatabase(db: D1Database | undefined): void { this.db = db; }
  public resetMemoryForTesting(): void { this.memoryOrders.clear(); }

  /** Request-scoped D1, resolved per call — the singleton is created at module
   *  load, long before any request context exists. Never cache this: a single
   *  value would only ever be right for the first request. */
  private resolveDb(): D1Database | undefined {
    if (this.db) return this.db;
    try {
      return createServerClient() ?? undefined;
    } catch {
      return undefined;
    }
  }

  public async recordOrder(input: RecordCheckoutOrderInput): Promise<CheckoutOrderRow> {
    const nowMs = input.createdAtMs ?? Date.now();
    const row: CheckoutOrderRow = {
      orderId: input.orderId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      targetTier: input.targetTier,
      expectedAmountUsd: input.expectedAmountUsd,
      payCurrency: input.payCurrency,
      invoiceId: input.invoiceId,
      invoiceUrl: input.invoiceUrl,
      status: 'PENDING',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    this.memoryOrders.set(row.orderId, row);
    const db = this.resolveDb();
    if (db) await insertD1CheckoutOrder(db, row);
    return row;
  }

  public async getOrder(orderId: string): Promise<CheckoutOrderRow | undefined> {
    const trimmed = orderId?.trim();
    if (!trimmed) return undefined;
    const db = this.resolveDb();
    if (db) {
      try {
        const dbRow = await fetchD1CheckoutOrder(db, trimmed);
        if (dbRow) {
          this.memoryOrders.set(trimmed, dbRow);
          return dbRow;
        }
      } catch {
        // D1 unavailable — fall through to the in-memory row rather than
        // refusing a payment we already recorded.
      }
    }
    return this.memoryOrders.get(trimmed);
  }

  public async markPaid(orderId: string, paymentId: string, nowMs?: number): Promise<void> {
    const at = nowMs ?? Date.now();
    const existing = this.memoryOrders.get(orderId);
    if (existing) {
      this.memoryOrders.set(orderId, { ...existing, paymentId, status: 'PAID', updatedAtMs: at });
    }
    const db = this.resolveDb();
    if (db) {
      try {
        await markD1CheckoutOrderPaid(db, orderId, paymentId, at);
      } catch {
        // Marking paid is bookkeeping; losing it must not lose the activation.
      }
    }
  }

  /** Resolves the tier an IPN is allowed to grant. An order the server never
   *  created is not a payment we can act on, so it resolves to a refusal rather
   *  than to whatever the callback claimed. */
  public async resolveTierDecision(orderId: string): Promise<Result<CheckoutOrderRow>> {
    const order = await this.getOrder(orderId);
    if (!order) {
      return err(`CHECKOUT_ORDER_UNKNOWN: no server-issued order for order_id ${orderId}`);
    }
    if (order.status === 'EXPIRED' || order.status === 'CANCELLED') {
      return err(`CHECKOUT_ORDER_INACTIVE: order ${orderId} is ${order.status}`);
    }
    return ok(order);
  }
}

export const defaultCheckoutOrderStore = new CheckoutOrderStore();
