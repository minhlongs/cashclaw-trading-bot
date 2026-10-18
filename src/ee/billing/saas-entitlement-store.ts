// Step 16 & 18 Runtime Seam: Cloudflare D1 + In-Memory SaaS Entitlement & IPN Store
// Persists saas_workspace_entitlements and saas_nowpayments_ipn_events (Migration 0013).

import type { D1Database } from '@/lib/db/types';
import type { SaasTier } from '../tenancy/tenant-policy';
import { getEntitlementsForTier } from './tier-entitlements';
import {
  fetchD1WorkspaceEntitlement, hasD1ProcessedPayment, insertD1IpnEvent, upsertD1WorkspaceEntitlement,
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

  public async hasProcessedPayment(paymentId: string): Promise<boolean> {
    if (this.processedPayments.has(paymentId)) return true;
    if (this.db && (await hasD1ProcessedPayment(this.db, paymentId))) {
      this.processedPayments.add(paymentId);
      return true;
    }
    return false;
  }

  public async recordIpnAndUpgradeTier(record: IpnActivationRecord): Promise<WorkspaceEntitlementRow> {
    const nowMs = record.processedAtMs ?? Date.now();
    const isActivated = record.paymentStatus === 'finished' || record.paymentStatus === 'confirmed';
    if (isActivated) this.processedPayments.add(record.paymentId);
    if (this.db) await insertD1IpnEvent(this.db, record, nowMs);
    if (!isActivated) return this.getWorkspaceEntitlement(record.workspaceId);

    const spec = getEntitlementsForTier(record.targetTier);
    const updatedRow: WorkspaceEntitlementRow = {
      workspaceId: record.workspaceId, ownerUserId: record.ownerUserId ?? 'system',
      tier: record.targetTier, maxRunningBots: spec.maxRunningPaperBots,
      maxWalkForwardWindows: spec.maxWalkForwardWindows, monthlyLlmCredits: spec.monthlyLlmCredits,
      managedLlmPoolEnabled: spec.managedLlmPoolAllowed, updatedAtMs: nowMs,
    };
    this.workspaceEntitlements.set(record.workspaceId, updatedRow);
    if (this.db) await upsertD1WorkspaceEntitlement(this.db, updatedRow);
    return updatedRow;
  }

  public async getWorkspaceEntitlement(workspaceId: string): Promise<WorkspaceEntitlementRow> {
    if (this.db) {
      const dbRow = await fetchD1WorkspaceEntitlement(this.db, workspaceId);
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
}

export const defaultSaasEntitlementStore = new SaasEntitlementStore();
