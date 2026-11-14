// Step 16 & 18 Runtime Seam: Cloudflare D1 + In-Memory SaaS Entitlement & IPN Store
// Persists saas_workspace_entitlements and saas_nowpayments_ipn_events (Migration 0013).
// Includes atomic synchronous in-flight + D1 persisted replay lock for 10x parallel IPN bursts.

import type { D1Database } from '@/lib/db/types';
import { createServerClient } from '@/lib/db/client';
import type { SaasTier } from '../tenancy/tenant-policy';
import { getEntitlementsForTier } from './tier-entitlements';
import { isActivatingIpnStatus, type NowPaymentsIpnPayload } from './nowpayments-ipn';
import {
  fetchD1WorkspaceEntitlement,
  fetchD1WorkspaceOwner,
  hasD1ProcessedPayment,
  insertD1IpnEvent,
  upsertD1WorkspaceEntitlement,
} from './saas-entitlement-d1';

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
  private readonly processedOrders = new Set<string>();
  private readonly inFlightPayments = new Set<string>();
  private readonly inFlightOrders = new Set<string>();
  private readonly workspaceEntitlements = new Map<string, WorkspaceEntitlementRow>();

  constructor(db?: D1Database) { this.db = db; }
  public setDatabase(db: D1Database | undefined): void { this.db = db; }

  public resetMemoryForTesting(): void {
    this.processedPayments.clear();
    this.processedOrders.clear();
    this.inFlightPayments.clear();
    this.inFlightOrders.clear();
    this.workspaceEntitlements.clear();
  }

  private resolveDb(): D1Database | undefined {
    if (this.db) return this.db;
    try { return createServerClient() ?? undefined; } catch { return undefined; }
  }

  public async hasProcessedPayment(paymentId: string): Promise<boolean> {
    if (this.processedPayments.has(paymentId) || this.inFlightPayments.has(paymentId)) return true;
    const db = this.resolveDb();
    if (db && (await hasD1ProcessedPayment(db, paymentId))) {
      this.processedPayments.add(paymentId);
      return true;
    }
    return false;
  }

  /** Synchronously claims an in-flight payment + order lock BEFORE awaiting D1. */
  public async tryClaimPaymentActivation(
    paymentId: string,
    orderId?: string,
  ): Promise<'ACQUIRED' | 'DUPLICATE'> {
    if (this.processedPayments.has(paymentId) || this.inFlightPayments.has(paymentId)) return 'DUPLICATE';
    if (orderId && (this.processedOrders.has(orderId) || this.inFlightOrders.has(orderId))) return 'DUPLICATE';

    this.inFlightPayments.add(paymentId);
    if (orderId) this.inFlightOrders.add(orderId);

    const db = this.resolveDb();
    if (db) {
      try {
        if (await hasD1ProcessedPayment(db, paymentId)) {
          this.finalizePaymentClaim(paymentId, orderId, true);
          return 'DUPLICATE';
        }
      } catch (cause) {
        this.finalizePaymentClaim(paymentId, orderId, false);
        throw cause;
      }
    }
    return 'ACQUIRED';
  }

  public finalizePaymentClaim(paymentId: string, orderId: string | undefined, markProcessed: boolean): void {
    if (markProcessed) {
      this.processedPayments.add(paymentId);
      if (orderId) this.processedOrders.add(orderId);
    }
    this.inFlightPayments.delete(paymentId);
    if (orderId) this.inFlightOrders.delete(orderId);
  }

  public async recordIpnAndUpgradeTier(record: IpnActivationRecord): Promise<WorkspaceEntitlementRow> {
    const nowMs = record.processedAtMs ?? Date.now();
    const isActivated = isActivatingIpnStatus(record.paymentStatus as NowPaymentsIpnPayload['payment_status']);
    if (isActivated) this.processedPayments.add(record.paymentId);
    const db = this.resolveDb();
    if (db) {
      const outcome = await insertD1IpnEvent(db, record, nowMs);
      if (outcome === 'DUPLICATE_FINALIZED') {
        return this.getWorkspaceEntitlement(record.workspaceId);
      }
    }
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

  public async resolveWorkspaceOwner(workspaceId: string): Promise<string | undefined> {
    const db = this.resolveDb();
    if (!db) return undefined;
    try { return await fetchD1WorkspaceOwner(db, workspaceId); } catch { return undefined; }
  }
}

export const defaultSaasEntitlementStore = new SaasEntitlementStore();
