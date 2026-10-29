import { describe, expect, it, vi } from 'vitest';
import { SaasEntitlementStore } from '../billing/saas-entitlement-store';
import type { D1Database } from '@/lib/db/types';

describe('legacy NOWPayments mutation path is disabled', () => {
  it('rejects payload-supplied workspace/tier updates without issuing D1 writes', async () => {
    const run = vi.fn();
    const db = { prepare: vi.fn(() => ({ bind: vi.fn().mockReturnThis(), run })) } as unknown as D1Database;
    const store = new SaasEntitlementStore(db);
    await expect(store.recordIpnAndUpgradeTier({
      paymentId: 'payment-forged', workspaceId: 'victim-workspace', ownerUserId: 'attacker',
      targetTier: 'MASTER', paymentStatus: 'finished', payAmount: 0.01, payCurrency: 'USD',
    })).rejects.toThrow('Legacy payment mutation disabled');
    expect(db.prepare).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
