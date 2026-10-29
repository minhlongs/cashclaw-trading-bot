import { describe, expect, it, vi } from 'vitest';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';
import { SaasEntitlementStore } from '../billing/saas-entitlement-store';

describe('SaasEntitlementStore payment retry safety', () => {
  it('does not mark a payment processed in memory when entitlement persistence fails', async () => {
    const eventInsert = vi.fn();
    const db = {
      prepare(sql: string) {
        let values: unknown[] = [];
        const statement = {
          bind(...next: unknown[]) { values = next; return statement; },
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn(async () => {
            if (sql.includes('INSERT INTO saas_workspace_entitlements')) throw new Error('synthetic D1 outage');
            if (sql.includes('saas_nowpayments_ipn_events')) eventInsert(values);
            return { meta: { changes: 1 } };
          }),
        };
        return statement as unknown as D1PreparedStatement;
      },
    } as unknown as D1Database;
    const store = new SaasEntitlementStore(db);

    await expect(store.recordIpnAndUpgradeTier({
      paymentId: 'payment-retry-fixture', workspaceId: 'workspace-fixture', targetTier: 'PREMIUM',
      paymentStatus: 'finished', payAmount: 25, payCurrency: 'USDT',
    })).rejects.toThrow('synthetic D1 outage');

    expect(await store.hasProcessedPayment('payment-retry-fixture')).toBe(false);
    expect(eventInsert).not.toHaveBeenCalled();
  });
});
