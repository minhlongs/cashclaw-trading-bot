// The entitlement store is a module-level singleton created before any request
// context exists. Its D1 binding must therefore be resolved per call, or every
// paid workspace silently reads back as BASIC and a paying customer stays on the
// free tier. These tests pin that lazy resolution against a D1 stand-in.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

interface EntitlementRow {
  workspace_id: string;
  owner_user_id: string;
  tier: string;
  max_running_bots: number;
  max_walk_forward_windows: number;
  monthly_llm_credits: number;
  managed_llm_pool_enabled: number;
  updated_at_ms: number;
}

interface MemberRow { workspace_id: string; user_id: string; role: string }

const state: { client: D1Database | null; entitlementRows: EntitlementRow[]; memberRows: MemberRow[] } = {
  client: null,
  entitlementRows: [],
  memberRows: [],
};

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => state.client,
  createLogger: () => ({ warn: () => {}, info: () => {}, error: () => {} }),
}));

/** D1 stand-in that binds the workspace or user id the way the real driver does. */
function makeD1(): D1Database {
  return {
    prepare(sql: string): D1PreparedStatement {
      let bound = '';
      const stmt = {
        bind(value: unknown) { bound = String(value); return stmt; },
        async first<T>() {
          if (sql.includes('FROM saas_workspace_entitlements')) {
            const row = state.entitlementRows.find((r) => r.workspace_id === bound);
            return (row ?? null) as T | null;
          }
          if (sql.includes('FROM saas_workspace_members')) {
            // The owner lookup binds the workspace id, while the user-facing
            // membership list binds the user id.
            const row = sql.includes("role = 'OWNER'")
              ? state.memberRows.find((r) => r.workspace_id === bound)
              : state.memberRows.find((r) => r.user_id === bound);
            return (row ?? null) as T | null;
          }
          return null as T | null;
        },
        async firstRow<T>() { return stmt.first<T>(); },
        async all<T>() { return { results: [] as unknown as T[], meta: { duration: 1 } }; },
        async run() { return { meta: { changes: 1, last_row_id: 0, duration: 1 } }; },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function seedEntitlement(workspaceId: string, tier: string): void {
  state.entitlementRows.push({
    workspace_id: workspaceId,
    owner_user_id: 'usr_owner',
    tier,
    max_running_bots: 25,
    max_walk_forward_windows: 32,
    monthly_llm_credits: 100000,
    managed_llm_pool_enabled: 1,
    updated_at_ms: 1,
  });
}

describe('SaasEntitlementStore D1 binding resolution', () => {
  beforeEach(async () => {
    state.client = null;
    state.entitlementRows = [];
    state.memberRows = [];
    const { defaultSaasEntitlementStore } = await import('../saas-entitlement-store');
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
  });

  it('reads a paid tier from D1 with no explicit setDatabase call', async () => {
    seedEntitlement('ws_paid', 'MASTER');
    state.client = makeD1();

    const { defaultSaasEntitlementStore } = await import('../saas-entitlement-store');
    await expect(defaultSaasEntitlementStore.getWorkspaceTier('ws_paid')).resolves.toBe('MASTER');
  });

  it('still returns BASIC for a workspace D1 has never heard of', async () => {
    state.client = makeD1();

    const { defaultSaasEntitlementStore } = await import('../saas-entitlement-store');
    await expect(defaultSaasEntitlementStore.getWorkspaceTier('ws_unknown')).resolves.toBe('BASIC');
  });

  it('falls back to BASIC without D1 rather than throwing', async () => {
    state.client = null;

    const { defaultSaasEntitlementStore } = await import('../saas-entitlement-store');
    await expect(defaultSaasEntitlementStore.getWorkspaceTier('ws_any')).resolves.toBe('BASIC');
  });

  it('persists an IPN activation to D1 resolved lazily', async () => {
    state.client = makeD1();

    const { defaultSaasEntitlementStore } = await import('../saas-entitlement-store');
    const row = await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_lazy_bind',
      workspaceId: 'ws_lazy',
      targetTier: 'PREMIUM',
      paymentStatus: 'finished',
      payAmount: 29,
      payCurrency: 'USDT',
    });

    expect(row.tier).toBe('PREMIUM');
    // The write went through the lazily-resolved client, so a later read of the
    // same singleton must observe it without the test re-seeding the store.
    await expect(defaultSaasEntitlementStore.getWorkspaceTier('ws_lazy')).resolves.toBe('PREMIUM');
  });

  it('resolves the workspace owner from D1 for the IPN handler', async () => {
    state.memberRows.push({ workspace_id: 'ws_owned', user_id: 'usr_real_owner', role: 'OWNER' });
    state.client = makeD1();

    const { defaultSaasEntitlementStore } = await import('../saas-entitlement-store');
    await expect(defaultSaasEntitlementStore.resolveWorkspaceOwner('ws_owned')).resolves.toBe('usr_real_owner');
  });

  it('reports idempotent replay only after D1 confirms the payment', async () => {
    state.client = makeD1();

    const { defaultSaasEntitlementStore } = await import('../saas-entitlement-store');
    await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_seen_once',
      workspaceId: 'ws_replay',
      targetTier: 'ENTERPRISE',
      paymentStatus: 'finished',
      payAmount: 99,
      payCurrency: 'USDT',
    });
    await expect(defaultSaasEntitlementStore.hasProcessedPayment('pay_seen_once')).resolves.toBe(true);
    await expect(defaultSaasEntitlementStore.hasProcessedPayment('pay_never_seen')).resolves.toBe(false);
  });
});
