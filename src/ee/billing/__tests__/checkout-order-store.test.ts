// The checkout order store is the authority that lets an IPN callback change a
// tier. Two behaviors matter: an order that was never issued must resolve to a
// refusal rather than to whatever the callback claimed, and a recorded order must
// survive being read back through the same code path production uses.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CheckoutOrderStore } from '../checkout-order-store';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

/** A D1 stand-in whose rows live in memory, so the store's D1 branch is the one
 *  under test rather than the in-memory fallback. */
function createMockD1(): { db: D1Database; rows: Map<string, Record<string, unknown>> } {
  const rows = new Map<string, Record<string, unknown>>();
  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      let params: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]) {
          params = values;
          return stmt;
        },
        async first<T = unknown>(): Promise<T | null> {
          if (sql.includes('FROM saas_checkout_orders')) {
            return (rows.get(String(params[0] ?? '')) as T | undefined) ?? null;
          }
          return null;
        },
        async firstRow<T = unknown>(): Promise<T | null> {
          return stmt.first<T>();
        },
        async all<T = unknown>() {
          return { results: [] as T[], meta: { duration: 1 } };
        },
        async run() {
          if (sql.includes('INSERT OR REPLACE INTO saas_checkout_orders')) {
            rows.set(String(params[0]), {
              order_id: params[0],
              workspace_id: params[1],
              user_id: params[2],
              target_tier: params[3],
              expected_amount_usd: params[4],
              pay_currency: params[5],
              invoice_id: params[6],
              invoice_url: params[7],
              payment_id: params[8],
              status: params[9],
              created_at_ms: params[10],
              updated_at_ms: params[11],
            });
          } else if (sql.includes('UPDATE saas_checkout_orders')) {
            const existing = rows.get(String(params[2]));
            if (existing) {
              rows.set(String(params[2]), { ...existing, payment_id: params[0], status: 'PAID', updated_at_ms: params[1] });
            }
          }
          return { meta: { changes: 1, last_row_id: 1, duration: 1 } };
        },
      };
      return stmt;
    },
    async batch<T = unknown>() {
      return [] as T[];
    },
    async exec() {
      return { count: 1, duration: 1 };
    },
    async dump() {
      return '';
    },
  };
  return { db, rows };
}

describe('CheckoutOrderStore', () => {
  let store: CheckoutOrderStore;

  beforeEach(() => {
    store = new CheckoutOrderStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes an order so a later IPN can resolve the tier', async () => {
    await store.recordOrder({
      orderId: 'ws:ws_a:abc',
      workspaceId: 'ws_a',
      targetTier: 'PREMIUM',
      expectedAmountUsd: 29,
      payCurrency: 'usd',
    });

    const order = await store.getOrder('ws:ws_a:abc');
    expect(order?.workspaceId).toBe('ws_a');
    expect(order?.targetTier).toBe('PREMIUM');
    expect(order?.status).toBe('PENDING');
  });

  it('refuses a tier decision for an order it never issued', async () => {
    const decision = await store.resolveTierDecision('ws:ws_forged:zzz');

    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error).toContain('CHECKOUT_ORDER_UNKNOWN');
  });

  it('resolves the tier decision for an order it issued', async () => {
    await store.recordOrder({
      orderId: 'ws:ws_b:def',
      workspaceId: 'ws_b',
      targetTier: 'ENTERPRISE',
      expectedAmountUsd: 99,
      payCurrency: 'usd',
    });

    const decision = await store.resolveTierDecision('ws:ws_b:def');
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.data.targetTier).toBe('ENTERPRISE');
      expect(decision.data.workspaceId).toBe('ws_b');
    }
  });

  it('treats a blank order id as unknown rather than matching anything', async () => {
    await store.recordOrder({
      orderId: 'ws:ws_c:ghi',
      workspaceId: 'ws_c',
      targetTier: 'MASTER',
      expectedAmountUsd: 299,
      payCurrency: 'usd',
    });

    expect(await store.getOrder('')).toBeUndefined();
    expect((await store.resolveTierDecision('   ')).ok).toBe(false);
  });

  it('reads the order back from D1 rather than only from memory', async () => {
    const { db, rows } = createMockD1();
    const d1Store = new CheckoutOrderStore(db);

    await d1Store.recordOrder({
      orderId: 'ws:ws_d:jkl',
      workspaceId: 'ws_d',
      targetTier: 'MASTER',
      expectedAmountUsd: 299,
      payCurrency: 'btc',
      invoiceId: 'inv_77',
      invoiceUrl: 'https://nowpayments.io/invoice/inv_77',
    });
    // Prove the write landed in D1, then drop the in-memory view entirely.
    expect(rows.has('ws:ws_d:jkl')).toBe(true);
    d1Store.resetMemoryForTesting();

    const order = await d1Store.getOrder('ws:ws_d:jkl');
    expect(order?.targetTier).toBe('MASTER');
    expect(order?.payCurrency).toBe('btc');
    expect(order?.invoiceId).toBe('inv_77');
  });

  it('marks the order paid once the payment is confirmed', async () => {
    const { db, rows } = createMockD1();
    const d1Store = new CheckoutOrderStore(db);
    await d1Store.recordOrder({
      orderId: 'ws:ws_e:mno',
      workspaceId: 'ws_e',
      targetTier: 'PREMIUM',
      expectedAmountUsd: 29,
      payCurrency: 'usd',
    });

    await d1Store.markPaid('ws:ws_e:mno', 'pay_555', 1_760_000_000_000);

    expect(rows.get('ws:ws_e:mno')?.status).toBe('PAID');
    expect(rows.get('ws:ws_e:mno')?.payment_id).toBe('pay_555');
  });

  it('still reports an order when the D1 read fails, so a paid customer is not refused', async () => {
    // The order was written durably, but the later read cannot reach D1. Returning
    // "unknown" here would refuse a payment the customer really made, so the store
    // answers from the copy it kept in memory.
    const brokenReadDb = {
      prepare(sql: string): D1PreparedStatement {
        let params: unknown[] = [];
        const stmt: D1PreparedStatement = {
          bind(...values: unknown[]) {
            params = values;
            return stmt;
          },
          async first<T = unknown>(): Promise<T | null> {
            if (sql.includes('FROM saas_checkout_orders')) throw new Error('D1_UNAVAILABLE');
            return null;
          },
          async firstRow<T = unknown>(): Promise<T | null> {
            return stmt.first<T>();
          },
          async all<T = unknown>() {
            return { results: [] as T[], meta: { duration: 1 } };
          },
          async run() {
            void params;
            return { meta: { changes: 1, last_row_id: 1, duration: 1 } };
          },
        };
        return stmt;
      },
    } as unknown as D1Database;
    const fallbackStore = new CheckoutOrderStore(brokenReadDb);
    await fallbackStore.recordOrder({
      orderId: 'ws:ws_f:pqr',
      workspaceId: 'ws_f',
      targetTier: 'ENTERPRISE',
      expectedAmountUsd: 99,
      payCurrency: 'usd',
    });

    const decision = await fallbackStore.resolveTierDecision('ws:ws_f:pqr');
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.data.targetTier).toBe('ENTERPRISE');
  });
});
