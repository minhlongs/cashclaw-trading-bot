// Step 16 & 18 Runtime Seam: Cloudflare D1 + In-Memory SaaS Entitlement & IPN Store
// Persists saas_workspace_entitlements and saas_nowpayments_ipn_events (Migration 0013).

import type { D1Database } from '@/lib/db/types';
import { createServerClient } from '@/lib/db/client';
import type { SaasTier } from '../tenancy/tenant-policy';
import { getEntitlementsForTier } from './tier-entitlements';
import {
  fetchD1WorkspaceEntitlement, fetchD1WorkspaceOwner, hasD1ProcessedPayment, insertD1IpnEvent, upsertD1WorkspaceEntitlement,
} from './saas-entitlement-d1';

export interface IpnActivationRecord {
  readonly paymentId: string; readonly workspaceId: string; readonly ownerUserId?: string;
  readonly targetTier: SaasTier; readonly paymentStatus: string; readonly payAmount: number;
  readonly payCurrency: string; readonly processedAtMs?: number;
}

export interface WorkspaceEntitlementRow {
  readonly workspaceId: string; readonly ownerUserId: string; readonly tier: SaasTier;
  readonly maxRunningBots: number; readonly maxWalkForwardWindows: number;
  readonly monthlyLlmCredits: number; readonly managedLlmPoolEnabled: boolean; readonly updatedAtMs: number;
}

export class SaasEntitlementStore {
  private db?: D1Database;
  private readonly processedPayments = new Set<string>();
  private readonly workspaceEntitlements = new Map<string, WorkspaceEntitlementRow>();

  constructor(db?: D1Database) { this.db = db; }
  public setDatabase(db: D1Database | undefined): void { this.db = db; }
  public resetMemoryForTesting(): void { this.processedPayments.clear(); this.workspaceEntitlements.clear(); }

  /**
   * The D1 binding for this request, resolved lazily because the singleton is
   * created at module load — long before any request context exists. Without
   * this the store never sees D1, and every paid workspace reads back as BASIC,
   * so a customer who paid for MASTER is silently kept on the free tier.
   * Resolved per call: `getCloudflareContext()` is request-scoped, so a single
   * cached value would only ever be correct for the first request.
   */
  private resolveDb(): D1Database | undefined {
    if (this.db) return this.db;
    try {
      return createServerClient() ?? undefined;
    } catch {
      return undefined;
    }
  }

  public async hasProcessedPayment(paymentId: string): Promise<boolean> {
    const db = this.resolveDb();
    if (this.processedPayments.has(paymentId)) return true;
    if (db && (await hasD1ProcessedPayment(db, paymentId))) {
      this.processedPayments.add(paymentId);
      return true;
    }
    return false;
  }

  public async recordIpnAndUpgradeTier(record: IpnActivationRecord): Promise<WorkspaceEntitlementRow> {
    const nowMs = record.processedAtMs ?? Date.now();
    const isActivated = record.paymentStatus === 'finished' || record.paymentStatus === 'confirmed';
    if (isActivated) this.processedPayments.add(record.paymentId);
    const db = this.resolveDb();
    if (db) await insertD1IpnEvent(db, record, nowMs);
    if (!isActivated) return this.getWorkspaceEntitlement(record.workspaceId);

    const spec = getEntitlementsForTier(record.targetTier);
    const updatedRow: WorkspaceEntitlementRow = {
      workspaceId: record.workspaceId, ownerUserId: record.ownerUserId ?? 'system',
      tier: record.targetTier, maxRunningBots: spec.maxRunningPaperBots,
      maxWalkForwardWindows: spec.maxWalkForwardWindows, monthlyLlmCredits: spec.monthlyLlmCredits,
      managedLlmPoolEnabled: spec.managedLlmPoolAllowed, updatedAtMs: nowMs,
    };
    this.workspaceEntitlements.set(record.workspaceId, updatedRow);
    if (db) await upsertD1WorkspaceEntitlement(db, updatedRow);
    return updatedRow;
  }

  public async getWorkspaceEntitlement(workspaceId: string): Promise<WorkspaceEntitlementRow> {
    const db = this.resolveDb();
    if (db) {
      const dbRow = await fetchD1WorkspaceEntitlement(db, workspaceId);
      if (dbRow) {
        this.workspaceEntitlements.set(workspaceId, dbRow);
        return dbRow;
      }
    }
    const cached = this.workspaceEntitlements.get(workspaceId);
    if (cached) return cached;
    const basicSpec = getEntitlementsForTier('BASIC');
    return {
      workspaceId, ownerUserId: 'default', tier: 'BASIC',
      maxRunningBots: basicSpec.maxRunningPaperBots, maxWalkForwardWindows: basicSpec.maxWalkForwardWindows,
      monthlyLlmCredits: basicSpec.monthlyLlmCredits, managedLlmPoolEnabled: basicSpec.managedLlmPoolAllowed,
      updatedAtMs: 0,
    };
  }

  public async getWorkspaceTier(workspaceId: string): Promise<SaasTier> {
    return (await this.getWorkspaceEntitlement(workspaceId)).tier;
  }

  /**
   * The signed-in user who owns this workspace, or undefined when the workspace
   * has no member row yet. The IPN handler uses this to stop writing the
   * 'system' sentinel into `owner_user_id`, which made upgraded workspaces
   * impossible to trace back to a real account. When no owner is known the
   * caller keeps the existing sentinel and records it, rather than guessing.
   */
  public async resolveWorkspaceOwner(workspaceId: string): Promise<string | undefined> {
    const db = this.resolveDb();
    if (!db) return undefined;
    try {
      return await fetchD1WorkspaceOwner(db, workspaceId);
    } catch {
      return undefined;
    }
  }
}

export const defaultSaasEntitlementStore = new SaasEntitlementStore();
