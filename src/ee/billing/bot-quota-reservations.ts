import type { D1Database } from '@/lib/db/types';
import type { WorkspaceTierContext } from '../tenancy/workspace-request-context';

export type BotReservationResult =
  | { readonly kind: 'reserved' }
  | { readonly kind: 'created' }
  | { readonly kind: 'in_progress' }
  | { readonly kind: 'quota_exceeded' }
  | { readonly kind: 'idempotency_conflict' };

type ReservationRow = { request_hash: string; owner_user_id: string; status: string; lease_expires_at_ms: number };
const RESERVATION_TTL_MS = 120_000;

function existingBotResult(
  bot: { workspace_id: string; user_id: string } | null,
  prior: ReservationRow | null,
  context: WorkspaceTierContext,
  requestHash: string,
): BotReservationResult | undefined {
  if (!bot) return undefined;
  if (bot.workspace_id !== context.workspaceId || prior?.owner_user_id !== context.userId) {
    return { kind: 'idempotency_conflict' };
  }
  return prior.request_hash === requestHash ? { kind: 'created' } : { kind: 'idempotency_conflict' };
}

async function resolvePriorReservation(
  db: D1Database,
  botId: string,
  context: WorkspaceTierContext,
  requestHash: string,
  prior: ReservationRow | null,
  nowMs: number,
): Promise<{ prior: ReservationRow | null; result?: BotReservationResult }> {
  if (!prior) return { prior: null };
  if (prior.request_hash !== requestHash) return { prior, result: { kind: 'idempotency_conflict' } };
  if (prior.status === 'reserved' && prior.lease_expires_at_ms > nowMs) {
    return { prior, result: { kind: 'in_progress' } };
  }
  if (prior.status !== 'reserved' || prior.lease_expires_at_ms > nowMs) {
    return { prior, result: { kind: 'idempotency_conflict' } };
  }

  await db.prepare(`DELETE FROM saas_bot_create_reservations
    WHERE bot_id = ? AND owner_user_id = ? AND status = 'reserved' AND lease_expires_at_ms <= ?
      AND NOT EXISTS (SELECT 1 FROM bots WHERE bots.id = saas_bot_create_reservations.bot_id)`)
    .bind(botId, context.userId, nowMs).run();
  return { prior: null };
}

function resolveFailedInsert(prior: ReservationRow | null, context: WorkspaceTierContext, requestHash: string, nowMs: number): BotReservationResult {
  if (!prior) return { kind: 'quota_exceeded' };
  if (prior.owner_user_id !== context.userId || prior.request_hash !== requestHash) return { kind: 'idempotency_conflict' };
  if (prior.status === 'created') return { kind: 'created' };
  if (prior.status === 'reserved' && prior.lease_expires_at_ms > nowMs) return { kind: 'in_progress' };
  return { kind: 'in_progress' };
}

export async function reserveWorkspaceBotSlot(
  context: WorkspaceTierContext,
  botId: string,
  requestHash: string,
  nowMs = Date.now(),
): Promise<BotReservationResult> {
  const { db } = context;
  const existingBot = await db.prepare('SELECT id, workspace_id, user_id FROM bots WHERE id = ?')
    .bind(botId).first<{ id: string; workspace_id: string; user_id: string }>();
  const prior = await db.prepare(`SELECT request_hash, owner_user_id, status, lease_expires_at_ms
    FROM saas_bot_create_reservations WHERE bot_id = ?`).bind(botId).first<ReservationRow>();
  const replay = existingBotResult(existingBot, prior, context, requestHash);
  if (replay) return replay;

  const state = await resolvePriorReservation(db, botId, context, requestHash, prior, nowMs);
  if (state.result) return state.result;

  const expiry = nowMs + RESERVATION_TTL_MS;
  const inserted = await db.prepare(`
    INSERT INTO saas_bot_create_reservations
      (bot_id, workspace_id, owner_user_id, request_hash, status, lease_expires_at_ms, created_at_ms, updated_at_ms)
    SELECT ?, ?, ?, ?, 'reserved', ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM saas_workspaces w
      JOIN saas_workspace_memberships m ON m.workspace_id = w.workspace_id
      JOIN saas_workspace_entitlements e ON e.workspace_id = w.workspace_id
      WHERE w.workspace_id = ? AND w.status = 'active' AND w.owner_user_id = e.owner_user_id
        AND m.user_id = ? AND m.status = 'active' AND m.role IN ('OWNER', 'ADMIN', 'TRADER')
        AND (m.expires_at_ms IS NULL OR m.expires_at_ms > ?)
        AND (
          SELECT COUNT(*) FROM bots b
          WHERE b.workspace_id = w.workspace_id
            AND b.status IN ('draft', 'paper_test', 'live_running', 'paused')
        ) + (
          SELECT COUNT(*) FROM saas_bot_create_reservations r
          WHERE r.workspace_id = w.workspace_id AND r.status = 'reserved'
            AND r.lease_expires_at_ms > ?
            AND NOT EXISTS (SELECT 1 FROM bots b WHERE b.id = r.bot_id)
        ) < CASE
          WHEN e.tier <> 'BASIC' AND (e.revoked_at_ms IS NOT NULL OR (e.expires_at_ms IS NOT NULL AND e.expires_at_ms <= ?))
            THEN 1
          ELSE e.max_running_bots
        END
    )
    ON CONFLICT(bot_id) DO NOTHING
    RETURNING bot_id
  `).bind(
    botId, context.workspaceId, context.userId, requestHash, expiry, nowMs, nowMs,
    context.workspaceId, context.userId, nowMs, nowMs, nowMs,
  ).first<{ bot_id: string }>();
  if (inserted?.bot_id) return { kind: 'reserved' };

  const after = await db.prepare(`SELECT request_hash, owner_user_id, status, lease_expires_at_ms
    FROM saas_bot_create_reservations WHERE bot_id = ?`).bind(botId).first<ReservationRow>();
  return resolveFailedInsert(after, context, requestHash, nowMs);
}

export async function markBotReservationCreated(
  db: D1Database, botId: string, ownerUserId: string, nowMs = Date.now(),
): Promise<void> {
  await db.prepare(`UPDATE saas_bot_create_reservations
    SET status = 'created', updated_at_ms = ? WHERE bot_id = ? AND owner_user_id = ? AND status = 'reserved'`)
    .bind(nowMs, botId, ownerUserId).run();
}

export async function releaseBotReservation(
  db: D1Database, botId: string, ownerUserId: string,
): Promise<void> {
  await db.prepare(`DELETE FROM saas_bot_create_reservations
    WHERE bot_id = ? AND owner_user_id = ? AND status = 'reserved'
      AND NOT EXISTS (SELECT 1 FROM bots WHERE bots.id = saas_bot_create_reservations.bot_id)`)
    .bind(botId, ownerUserId).run();
}

export function hashBotCreateRequest(payload: unknown): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  );
}
