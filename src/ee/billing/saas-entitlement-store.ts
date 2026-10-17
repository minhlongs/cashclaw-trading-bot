// Step 16 & 18 Runtime Seam: Cloudflare D1 + In-Memory SaaS Entitlement & IPN Store
// Persists saas_workspace_entitlements and saas_nowpayments_ipn_events (Migration 0013).

import type { D1Database } from '@/lib/db/types';
import { SaasTierSchema, type SaasTier } from '../tenancy/tenant-policy';
import { getEntitlementsForTier } from './tier-entitlements';

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

export interface WorkspaceEntitlementRow {
  readonly workspaceId: string;
  readonly ownerUserId: string;
  readonly tier: SaasTier;
  readonly maxRunningBots: number;
  readonly maxWalkForwardWindows: number;
  readonly monthlyLlmCredits: number;
  readonly managedLlmPoolEnabled: boolean;
  readonly updatedAtMs: number;
}

export class SaasEntitlementStore {
  private db?: D1Database;
  private readonly processedPayments = new Set<string>();
  private readonly workspaceEntitlements = new Map<string, WorkspaceEntitlementRow>();

  constructor(db?: D1Database) { this.db = db; }
  public setDatabase(db: D1Database | undefined): void { this.db = db; }

  public resetMemoryForTesting(): void {
    this.processedPayments.clear();
    this.workspaceEntitlements.clear();
  }

  public async hasProcessedPayment(paymentId: string): Promise<boolean> {
    if (this.processedPayments.has(paymentId)) return true;
    if (this.db) {
      const row = await this.db
        .prepare('SELECT payment_id FROM saas_nowpayments_ipn_events WHERE payment_id = ?')
        .bind(paymentId)
        .first<{ payment_id: string }>();
      if (row?.payment_id) {
        this.processedPayments.add(paymentId);
        return true;
      }
    }
    return false;
  }

  public async recordIpnAndUpgradeTier(record: IpnActivationRecord): Promise<WorkspaceEntitlementRow> {
    const nowMs = record.processedAtMs ?? Date.now();
    const isActivated = record.paymentStatus === 'finished' || record.paymentStatus === 'confirmed';
    if (isActivated) this.processedPayments.add(record.paymentId);

    if (this.db) {
      await this.db
        .prepare(
          `INSERT OR IGNORE INTO saas_nowpayments_ipn_events
           (payment_id, workspace_id, target_tier, payment_status, pay_amount, pay_currency, signature_verified, processed_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .bind(
          record.paymentId, record.workspaceId, record.targetTier, record.paymentStatus,
          record.payAmount, record.payCurrency, nowMs,
        )
        .run();
    }
    if (!isActivated) return this.getWorkspaceEntitlement(record.workspaceId);

    const spec = getEntitlementsForTier(record.targetTier);
    const updatedRow: WorkspaceEntitlementRow = {
      workspaceId: record.workspaceId,
      ownerUserId: record.ownerUserId ?? 'system',
      tier: record.targetTier,
      maxRunningBots: spec.maxRunningPaperBots,
      maxWalkForwardWindows: spec.maxWalkForwardWindows,
      monthlyLlmCredits: spec.monthlyLlmCredits,
      managedLlmPoolEnabled: spec.managedLlmPoolAllowed,
      updatedAtMs: nowMs,
    };

    this.workspaceEntitlements.set(record.workspaceId, updatedRow);

    if (this.db) {
      await this.db
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
          updatedRow.workspaceId,
          updatedRow.ownerUserId,
          updatedRow.tier,
          updatedRow.maxRunningBots,
          updatedRow.maxWalkForwardWindows,
          updatedRow.monthlyLlmCredits,
          updatedRow.managedLlmPoolEnabled ? 1 : 0,
          updatedRow.updatedAtMs,
        )
        .run();
    }

    return updatedRow;
  }

  public async getWorkspaceEntitlement(workspaceId: string): Promise<WorkspaceEntitlementRow> {
    if (this.db) {
      const dbRow = await this.db
        .prepare(
          'SELECT workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows, monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms FROM saas_workspace_entitlements WHERE workspace_id = ?',
        )
        .bind(workspaceId)
        .first<{
          workspace_id: string;
          owner_user_id: string;
          tier: string;
          max_running_bots: number;
          max_walk_forward_windows: number;
          monthly_llm_credits: number;
          managed_llm_pool_enabled: number;
          updated_at_ms: number;
        }>();

      if (dbRow) {
        const parsedTier = SaasTierSchema.safeParse(dbRow.tier);
        const tier: SaasTier = parsedTier.success ? parsedTier.data : 'BASIC';
        const mapped: WorkspaceEntitlementRow = {
          workspaceId: dbRow.workspace_id,
          ownerUserId: dbRow.owner_user_id,
          tier,
          maxRunningBots: dbRow.max_running_bots,
          maxWalkForwardWindows: dbRow.max_walk_forward_windows,
          monthlyLlmCredits: dbRow.monthly_llm_credits,
          managedLlmPoolEnabled: Boolean(dbRow.managed_llm_pool_enabled),
          updatedAtMs: dbRow.updated_at_ms,
        };
        this.workspaceEntitlements.set(workspaceId, mapped);
        return mapped;
      }
    }

    const cached = this.workspaceEntitlements.get(workspaceId);
    if (cached) {
      return cached;
    }

    const basicSpec = getEntitlementsForTier('BASIC');
    return {
      workspaceId,
      ownerUserId: 'default',
      tier: 'BASIC',
      maxRunningBots: basicSpec.maxRunningPaperBots,
      maxWalkForwardWindows: basicSpec.maxWalkForwardWindows,
      monthlyLlmCredits: basicSpec.monthlyLlmCredits,
      managedLlmPoolEnabled: basicSpec.managedLlmPoolAllowed,
      updatedAtMs: 0,
    };
  }

  public async getWorkspaceTier(workspaceId: string): Promise<SaasTier> {
    const entitlement = await this.getWorkspaceEntitlement(workspaceId);
    return entitlement.tier;
  }
}

export const defaultSaasEntitlementStore = new SaasEntitlementStore();
