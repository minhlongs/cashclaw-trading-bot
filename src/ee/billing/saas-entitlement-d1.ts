// Cloudflare D1 SQL persistence helpers for SaaS Entitlements & NOWPayments IPN Events
// Extracted from saas-entitlement-store.ts to maintain single-responsibility modules <= 115 LOC.

import type { D1Database } from '@/lib/db/types';
import { SaasTierSchema, type SaasTier } from '../tenancy/tenant-policy';
import type { IpnActivationRecord, WorkspaceEntitlementRow } from './saas-entitlement-store';

interface D1EntitlementRecord {
  workspace_id: string;
  owner_user_id: string;
  tier: string;
  max_running_bots: number;
  max_walk_forward_windows: number;
  monthly_llm_credits: number;
  managed_llm_pool_enabled: number;
  updated_at_ms: number;
}

export async function hasD1ProcessedPayment(
  db: D1Database,
  paymentId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT payment_id FROM saas_nowpayments_ipn_events WHERE payment_id = ? AND payment_status IN ('finished', 'confirmed')",
    )
    .bind(paymentId)
    .first<{ payment_id: string }>();
  return Boolean(row?.payment_id);
}

export async function insertD1IpnEvent(
  db: D1Database,
  record: IpnActivationRecord,
  nowMs: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO saas_nowpayments_ipn_events
       (payment_id, workspace_id, target_tier, payment_status, pay_amount, pay_currency, signature_verified, processed_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .bind(
      record.paymentId,
      record.workspaceId,
      record.targetTier,
      record.paymentStatus,
      record.payAmount,
      record.payCurrency,
      nowMs,
    )
    .run();
}

export async function upsertD1WorkspaceEntitlement(
  db: D1Database,
  row: WorkspaceEntitlementRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO saas_workspace_entitlements
       (workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows, monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET
         tier = excluded.tier,
         max_running_bots = excluded.max_running_bots,
         max_walk_forward_windows = excluded.max_walk_forward_windows,
         monthly_llm_credits = excluded.monthly_llm_credits,
         managed_llm_pool_enabled = excluded.managed_llm_pool_enabled,
         updated_at_ms = excluded.updated_at_ms`,
    )
    .bind(
      row.workspaceId,
      row.ownerUserId,
      row.tier,
      row.maxRunningBots,
      row.maxWalkForwardWindows,
      row.monthlyLlmCredits,
      row.managedLlmPoolEnabled ? 1 : 0,
      row.updatedAtMs,
    )
    .run();
}

export async function fetchD1WorkspaceEntitlement(
  db: D1Database,
  workspaceId: string,
): Promise<WorkspaceEntitlementRow | undefined> {
  const dbRow = await db
    .prepare(
      'SELECT workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows, monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms FROM saas_workspace_entitlements WHERE workspace_id = ?',
    )
    .bind(workspaceId)
    .first<D1EntitlementRecord>();

  if (!dbRow) return undefined;

  const parsedTier = SaasTierSchema.safeParse(dbRow.tier);
  const tier: SaasTier = parsedTier.success ? parsedTier.data : 'BASIC';
  return {
    workspaceId: dbRow.workspace_id,
    ownerUserId: dbRow.owner_user_id,
    tier,
    maxRunningBots: dbRow.max_running_bots,
    maxWalkForwardWindows: dbRow.max_walk_forward_windows,
    monthlyLlmCredits: dbRow.monthly_llm_credits,
    managedLlmPoolEnabled: Boolean(dbRow.managed_llm_pool_enabled),
    updatedAtMs: dbRow.updated_at_ms,
  };
}
