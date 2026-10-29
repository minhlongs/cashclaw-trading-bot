import type { D1Database } from '@/lib/db/types';
import { getEntitlementsForTier } from './tier-entitlements';
import { SaasTierSchema, type SaasTier } from '../tenancy/tenant-policy';
import type { NowPaymentsIpnPayload } from './nowpayments-ipn';

export interface PendingPaymentOrder {
  readonly orderId: string;
  readonly workspaceId: string;
  readonly targetTier: SaasTier;
  readonly priceAmount: number;
  readonly priceCurrency: 'USD';
  readonly expiresAtMs: number;
  readonly providerInvoiceCreated: false;
}

export async function createPendingPaymentOrder(
  db: D1Database,
  input: { workspaceId: string; ownerUserId: string; targetTier: Exclude<SaasTier, 'BASIC'> },
  nowMs = Date.now(),
): Promise<PendingPaymentOrder> {
  const orderId = `cc_${crypto.randomUUID()}`;
  const priceAmount = getEntitlementsForTier(input.targetTier).priceUsdMonthly;
  const expiresAtMs = nowMs + 30 * 60 * 1000;
  const result = await db.prepare(`
    INSERT INTO saas_payment_orders
      (order_id, workspace_id, owner_user_id, target_tier, price_amount, price_currency, status, created_at_ms, expires_at_ms)
    SELECT ?, ?, ?, ?, ?, 'USD', 'pending', ?, ?
    WHERE EXISTS (
      SELECT 1 FROM saas_workspaces w
      JOIN saas_workspace_memberships m ON m.workspace_id = w.workspace_id
      WHERE w.workspace_id = ? AND w.owner_user_id = ? AND w.status = 'active'
        AND m.user_id = ? AND m.role = 'OWNER' AND m.status = 'active'
        AND (m.expires_at_ms IS NULL OR m.expires_at_ms > ?)
    )
  `).bind(
    orderId, input.workspaceId, input.ownerUserId, input.targetTier, priceAmount,
    nowMs, expiresAtMs, input.workspaceId, input.ownerUserId, input.ownerUserId, nowMs,
  ).run();
  if (result.meta.changes !== 1) throw new Error('Workspace billing authorization changed');
  return {
    orderId, workspaceId: input.workspaceId, targetTier: input.targetTier,
    priceAmount, priceCurrency: 'USD', expiresAtMs, providerInvoiceCreated: false,
  };
}

export async function processVerifiedNowPaymentsEvent(
  db: D1Database,
  payload: NowPaymentsIpnPayload,
  payloadHash: string,
  nowMs = Date.now(),
): Promise<{ accepted: boolean; replay: boolean; activated: boolean; status?: string; tier?: SaasTier; workspaceId?: string }> {
  const eventId = `${payload.payment_id}:${payloadHash}`;
  // This schema version has no partially_paid order state; preserve that provider event in the
  // immutable callback history while treating it as waiting in the monotonic order state machine.
  const orderStatus = payload.payment_status === 'partially_paid' ? 'waiting' : payload.payment_status;
  const eligibleOrder = `EXISTS (
    SELECT 1 FROM saas_payment_orders o
    WHERE o.order_id = ? AND o.status <> 'cancelled'
      AND NOT (o.status IN ('failed', 'expired') AND ? = 'finished')
      AND EXISTS (SELECT 1 FROM saas_workspaces w JOIN saas_workspace_memberships m
        ON m.workspace_id = w.workspace_id AND m.user_id = o.owner_user_id AND m.role = 'OWNER' AND m.status = 'active'
        WHERE w.workspace_id = o.workspace_id AND w.owner_user_id = o.owner_user_id AND w.status = 'active'
          AND (m.expires_at_ms IS NULL OR m.expires_at_ms > ?))
      AND (o.expires_at_ms > ? OR o.status <> 'pending')
      AND ABS(o.price_amount - ?) < 0.000001
      AND upper(o.price_currency) = upper(?)
      AND (o.provider_payment_id IS NULL OR o.provider_payment_id = ?)
      AND NOT EXISTS (SELECT 1 FROM saas_payment_orders other
        WHERE other.provider_payment_id = ? AND other.order_id <> o.order_id)
  )`;

  // D1 batch is transactional. The final history update is deliberately after the entitlement
  // mutation so an injected audit-write failure proves the entitlement update rolls back too.
  const batchResults = await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO saas_nowpayments_ipn_event_history
        (event_id, payment_id, order_id, payment_status, payload_hash, signature_verified, processed, received_at_ms)
      SELECT ?, ?, ?, ?, ?, 1, 0, ?
      WHERE ${eligibleOrder}
    `).bind(
      eventId, payload.payment_id, payload.order_id, payload.payment_status, payloadHash, nowMs,
      payload.order_id, orderStatus, nowMs, nowMs, payload.price_amount, payload.price_currency, payload.payment_id, payload.payment_id,
    ),
    db.prepare(`
      UPDATE saas_payment_orders
      SET provider_payment_id = COALESCE(provider_payment_id, ?),
          status = CASE
            WHEN ? = 'refunded' THEN 'refunded'
            WHEN status = 'refunded' THEN status
            WHEN ? = 'finished' THEN 'finished'
            WHEN status = 'finished' THEN status
            WHEN (CASE ? WHEN 'waiting' THEN 0 WHEN 'partially_paid' THEN 0 WHEN 'confirming' THEN 1
                         WHEN 'confirmed' THEN 2 WHEN 'sending' THEN 3 WHEN 'failed' THEN 4 WHEN 'expired' THEN 4 ELSE 0 END)
               > (CASE status WHEN 'pending' THEN -1 WHEN 'waiting' THEN 0 WHEN 'partially_paid' THEN 0
                         WHEN 'confirming' THEN 1 WHEN 'confirmed' THEN 2 WHEN 'sending' THEN 3
                         WHEN 'failed' THEN 4 WHEN 'expired' THEN 4 WHEN 'finished' THEN 5 WHEN 'refunded' THEN 6 ELSE -1 END)
              THEN ? ELSE status END,
          paid_at_ms = CASE WHEN ? = 'finished' THEN COALESCE(paid_at_ms, ?) ELSE paid_at_ms END
      WHERE order_id = ? AND (provider_payment_id IS NULL OR provider_payment_id = ?)
        AND EXISTS (SELECT 1 FROM saas_nowpayments_ipn_event_history e
          WHERE e.event_id = ? AND e.processed = 0)
    `).bind(
      payload.payment_id, orderStatus, orderStatus,
      orderStatus, orderStatus, orderStatus,
      nowMs, payload.order_id, payload.payment_id, eventId,
    ),
    db.prepare(`
      INSERT INTO saas_workspace_entitlements
        (workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows,
         monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms, expires_at_ms, revoked_at_ms, current_payment_id)
      SELECT o.workspace_id, o.owner_user_id, o.target_tier, t.max_running_bots,
        t.max_walk_forward_windows, t.monthly_llm_credits, t.managed_llm_pool_enabled,
        o.created_at_ms,
        COALESCE((SELECT prior.expires_at_ms + 2592000000 FROM saas_workspace_entitlements prior
          WHERE prior.workspace_id = o.workspace_id AND prior.owner_user_id = o.owner_user_id
            AND prior.tier <> 'BASIC' AND prior.revoked_at_ms IS NULL AND prior.expires_at_ms > o.paid_at_ms),
          o.paid_at_ms + 2592000000), NULL, o.provider_payment_id
      FROM saas_payment_orders o
      JOIN saas_workspaces w ON w.workspace_id = o.workspace_id AND w.owner_user_id = o.owner_user_id AND w.status = 'active'
      JOIN saas_workspace_memberships m ON m.workspace_id = o.workspace_id AND m.user_id = o.owner_user_id
        AND m.role = 'OWNER' AND m.status = 'active'
      JOIN (SELECT 'PREMIUM' tier, 5 max_running_bots, 16 max_walk_forward_windows, 10000 monthly_llm_credits, 1 managed_llm_pool_enabled
            UNION ALL SELECT 'ENTERPRISE', 25, 64, 50000, 1
            UNION ALL SELECT 'MASTER', 100, 256, 250000, 1) t ON t.tier = o.target_tier
      WHERE o.order_id = ? AND o.status = 'finished' AND o.provider_payment_id = ?
        AND EXISTS (SELECT 1 FROM saas_nowpayments_ipn_event_history e WHERE e.event_id = ? AND e.processed = 0)
      ON CONFLICT(workspace_id) DO UPDATE SET
        owner_user_id = excluded.owner_user_id, tier = excluded.tier,
        max_running_bots = excluded.max_running_bots,
        max_walk_forward_windows = excluded.max_walk_forward_windows,
        monthly_llm_credits = excluded.monthly_llm_credits,
        managed_llm_pool_enabled = excluded.managed_llm_pool_enabled,
        updated_at_ms = excluded.updated_at_ms, expires_at_ms = excluded.expires_at_ms,
        revoked_at_ms = NULL, current_payment_id = excluded.current_payment_id
      WHERE saas_workspace_entitlements.owner_user_id = excluded.owner_user_id
        AND (saas_workspace_entitlements.current_payment_id IS NULL
          OR saas_workspace_entitlements.current_payment_id <> excluded.current_payment_id)
        AND (saas_workspace_entitlements.current_payment_id IS NULL OR EXISTS (
          SELECT 1 FROM saas_payment_orders prior
          WHERE prior.provider_payment_id = saas_workspace_entitlements.current_payment_id
            AND prior.created_at_ms <= excluded.updated_at_ms))
    `).bind(payload.order_id, payload.payment_id, eventId),
    db.prepare(`
      UPDATE saas_workspace_entitlements
      SET tier = 'BASIC', max_running_bots = 1, max_walk_forward_windows = 4,
          monthly_llm_credits = 1000, managed_llm_pool_enabled = 0,
          updated_at_ms = ?, expires_at_ms = NULL, revoked_at_ms = ?, current_payment_id = NULL
      WHERE current_payment_id = ? AND workspace_id = (SELECT workspace_id FROM saas_payment_orders WHERE order_id = ?)
        AND EXISTS (SELECT 1 FROM saas_payment_orders o WHERE o.order_id = ? AND o.status = 'refunded'
          AND o.provider_payment_id = ?)
        AND EXISTS (SELECT 1 FROM saas_nowpayments_ipn_event_history e WHERE e.event_id = ? AND e.processed = 0)
    `).bind(nowMs, nowMs, payload.payment_id, payload.order_id, payload.order_id, payload.payment_id, eventId),
    db.prepare(`
      INSERT OR REPLACE INTO saas_nowpayments_ipn_events
        (payment_id, workspace_id, target_tier, payment_status, pay_amount, pay_currency, signature_verified, processed_at_ms)
      SELECT o.provider_payment_id, o.workspace_id, o.target_tier, o.status, ?, ?, 1, ?
      FROM saas_payment_orders o
      WHERE o.order_id = ? AND o.provider_payment_id = ? AND o.status IN ('finished', 'refunded')
        AND EXISTS (SELECT 1 FROM saas_nowpayments_ipn_event_history e WHERE e.event_id = ? AND e.processed = 0)
    `).bind(payload.pay_amount, payload.pay_currency, nowMs, payload.order_id, payload.payment_id, eventId),
    db.prepare(`UPDATE saas_nowpayments_ipn_event_history SET processed = 1
      WHERE event_id = ? AND processed = 0`).bind(eventId),
  ]);

  const event = await db.prepare(`SELECT e.processed, o.workspace_id, o.target_tier, o.status
    FROM saas_nowpayments_ipn_event_history e
    JOIN saas_payment_orders o ON o.order_id = e.order_id
    WHERE e.event_id = ? AND e.payment_id = ?`).bind(eventId, payload.payment_id)
    .first<{ processed: number; workspace_id: string; target_tier: SaasTier; status: string }>();
  if (!event || event.processed !== 1) return { accepted: false, replay: false, activated: false };
  const insertedEvent = (batchResults[0] as { meta?: { changes?: number } } | undefined)?.meta?.changes === 1;
  const entitlementMutated = (batchResults[2] as { meta?: { changes?: number } } | undefined)?.meta?.changes === 1;
  const entitlement = await db.prepare(`SELECT tier, current_payment_id, expires_at_ms, revoked_at_ms
    FROM saas_workspace_entitlements WHERE workspace_id = ?`).bind(event.workspace_id)
    .first<{ tier: string; current_payment_id: string | null; expires_at_ms: number | null; revoked_at_ms: number | null }>();
  const activated = insertedEvent && entitlementMutated && event.status === 'finished' && entitlement?.tier === event.target_tier
    && entitlement.current_payment_id === payload.payment_id && entitlement.revoked_at_ms === null
    && (entitlement.expires_at_ms === null || entitlement.expires_at_ms > nowMs);
  return {
    accepted: true,
    replay: !insertedEvent,
    activated,
    status: event.status,
    tier: event.target_tier,
    workspaceId: event.workspace_id,
  };
}

export async function getWorkspaceEntitlementForOwner(
  db: D1Database, workspaceId: string, userId: string, nowMs = Date.now(),
): Promise<{ tier: SaasTier; expiresAtMs: number | null; revoked: boolean } | undefined> {
  const row = await db.prepare(`
    SELECT e.tier, e.expires_at_ms, e.revoked_at_ms
    FROM saas_workspace_entitlements e
    JOIN saas_workspaces w ON w.workspace_id = e.workspace_id AND w.owner_user_id = e.owner_user_id
    JOIN saas_workspace_memberships m ON m.workspace_id = w.workspace_id AND m.user_id = ? AND m.status = 'active'
    WHERE w.workspace_id = ? AND w.status = 'active'
      AND (m.expires_at_ms IS NULL OR m.expires_at_ms > ?)
  `).bind(userId, workspaceId, nowMs).first<{ tier: string; expires_at_ms: number | null; revoked_at_ms: number | null }>();
  if (!row) return undefined;
  const parsed = SaasTierSchema.safeParse(row.tier);
  if (!parsed.success) throw new Error('Invalid stored entitlement tier');
  const inactive = parsed.data !== 'BASIC'
    && (row.revoked_at_ms !== null || (row.expires_at_ms !== null && row.expires_at_ms <= nowMs));
  return { tier: inactive ? 'BASIC' : parsed.data, expiresAtMs: row.expires_at_ms, revoked: row.revoked_at_ms !== null };
}
