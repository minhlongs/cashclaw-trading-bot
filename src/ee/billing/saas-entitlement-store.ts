// Legacy arbitrary workspace/tier mutation API intentionally retired.
// All production NOWPayments processing must go through the server-created order binding and
// transactional D1 processor in nowpayments-order-store.ts.

import type { D1Database } from '@/lib/db/types';
import type { SaasTier } from '../tenancy/tenant-policy';

export interface IpnActivationRecord {
  readonly paymentId: string;
  readonly workspaceId: string;
  readonly ownerUserId?: string;
  readonly targetTier: SaasTier;
  readonly paymentStatus: string;
  readonly payAmount: number;
  readonly payCurrency: string;
  readonly processedAtMs?: number;
}

export class SaasEntitlementStore {
  constructor(_db?: D1Database) {}
  setDatabase(_db: D1Database | undefined): void {}
  resetMemoryForTesting(): void {}

  /** @deprecated Callback payload claims do not prove order/workspace ownership. */
  async recordIpnAndUpgradeTier(_record: IpnActivationRecord): Promise<never> {
    throw new Error('Legacy payment mutation disabled; use processVerifiedNowPaymentsEvent with a server-created order');
  }
}

/** @deprecated Kept for test/import compatibility only; has no mutable state or DB fallback. */
