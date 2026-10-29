import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { LocalD1Database } from './local-d1-adapter';
import type { D1Database } from '@/lib/db/types';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => holder.db }));

import { GET as entitlementGet, POST as callbackPost } from '@/app/api/ee/billing/nowpayments-ipn/route';
import { POST as createBillingOrder } from '@/app/api/ee/billing/orders/route';
import { canonicalizeNowPaymentsJson, computeNowPaymentsHmacSha512 } from '../nowpayments-ipn';
import { createPendingPaymentOrder, getWorkspaceEntitlementForOwner, processVerifiedNowPaymentsEvent } from '../nowpayments-order-store';
import { markBotReservationCreated, releaseBotReservation, reserveWorkspaceBotSlot } from '../bot-quota-reservations';
import { resolveWorkspaceTierContext } from '@/ee/tenancy/workspace-request-context';

const SECRET = 'local-d1-callback-test-secret';
const USER_ID = 'd1-test-user-a';
const WORKSPACE_ID = 'd1-test-workspace-a';
const NOW = Date.now();
let db: LocalD1Database;

async function seedWorkspace() {
  await db.batch([
    db.prepare(`INSERT OR REPLACE INTO user_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
      .bind('d1-test-session', USER_ID, Math.floor(NOW / 1000) + 3600, Math.floor(NOW / 1000)),
    db.prepare(`INSERT OR REPLACE INTO user_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
      .bind('d1-test-session-b', 'd1-test-user-b', Math.floor(NOW / 1000) + 3600, Math.floor(NOW / 1000)),
    db.prepare(`INSERT OR REPLACE INTO user_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
      .bind('d1-test-session-expired', USER_ID, Math.floor(NOW / 1000) - 1, Math.floor(NOW / 1000) - 3600),
    db.prepare(`INSERT OR REPLACE INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms) VALUES (?, ?, 'active', ?)`)
      .bind(WORKSPACE_ID, USER_ID, NOW),
    db.prepare(`INSERT OR REPLACE INTO saas_workspace_memberships (workspace_id, user_id, role, status, expires_at_ms, created_at_ms) VALUES (?, ?, 'OWNER', 'active', NULL, ?)`)
      .bind(WORKSPACE_ID, USER_ID, NOW),
    db.prepare(`INSERT OR REPLACE INTO saas_workspace_entitlements
      (workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows, monthly_llm_credits,
       managed_llm_pool_enabled, updated_at_ms, expires_at_ms, revoked_at_ms, current_payment_id)
      VALUES (?, ?, 'BASIC', 1, 4, 1000, 0, ?, NULL, NULL, NULL)`)
      .bind(WORKSPACE_ID, USER_ID, NOW),
    db.prepare(`INSERT OR REPLACE INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms) VALUES (?, ?, 'active', ?)`)
      .bind('d1-test-viewer-workspace', USER_ID, NOW),
    db.prepare(`INSERT OR REPLACE INTO saas_workspace_memberships (workspace_id, user_id, role, status, expires_at_ms, created_at_ms) VALUES (?, ?, 'VIEWER', 'active', NULL, ?)`)
      .bind('d1-test-viewer-workspace', 'd1-test-user-b', NOW),
    db.prepare(`INSERT OR REPLACE INTO saas_workspace_entitlements
      (workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows, monthly_llm_credits,
       managed_llm_pool_enabled, updated_at_ms, expires_at_ms, revoked_at_ms, current_payment_id)
      VALUES (?, ?, 'BASIC', 1, 4, 1000, 0, ?, NULL, NULL, NULL)`)
      .bind('d1-test-viewer-workspace', USER_ID, NOW),
  ]);
}

async function clearFixture() {
  await db.exec(`DROP TRIGGER IF EXISTS d1_test_fail_ipn_finalize;
    DROP TRIGGER IF EXISTS d1_test_fail_order_update;
    DELETE FROM saas_nowpayments_ipn_event_history WHERE order_id IN (SELECT order_id FROM saas_payment_orders WHERE workspace_id = '${WORKSPACE_ID}');
    DELETE FROM saas_nowpayments_ipn_events WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM saas_payment_orders WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM saas_bot_create_reservations WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM bots WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM bots WHERE workspace_id = 'd1-test-workspace-b';
    DELETE FROM saas_workspace_entitlements WHERE workspace_id IN ('${WORKSPACE_ID}', 'd1-test-workspace-b', 'd1-test-viewer-workspace');
    DELETE FROM saas_workspace_memberships WHERE workspace_id IN ('d1-test-workspace-b', 'd1-test-viewer-workspace');
    DELETE FROM saas_workspaces WHERE workspace_id IN ('d1-test-workspace-b', 'd1-test-viewer-workspace');
    DELETE FROM saas_workspace_memberships WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM saas_workspaces WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM user_sessions WHERE id IN ('d1-test-session', 'd1-test-session-b', 'd1-test-session-expired');`);
  await seedWorkspace();
}

function workspaceContext(userId = USER_ID, workspaceId = WORKSPACE_ID) {
  return { db: db as unknown as D1Database, userId, workspaceId, role: 'OWNER' as const, tier: 'BASIC' as const, entitlementExpiresAtMs: null };
}
async function insertBot(id: string, workspaceId: string, userId = USER_ID, status = 'draft') {
  await db.prepare(`INSERT INTO bots (id, user_id, workspace_id, name, strategy, pair, exchange, status, config_json, capital_allocated, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'grid', 'BTC/USDT', 'binance', ?, '{}', 1000, ?, ?)`)
    .bind(id, userId, workspaceId, id, status, Date.now(), Date.now()).run();
}
async function createOrder(targetTier: 'PREMIUM' | 'ENTERPRISE' = 'PREMIUM') {
  return createPendingPaymentOrder(db, { workspaceId: WORKSPACE_ID, ownerUserId: USER_ID, targetTier }, Date.now());
}
function paymentPayload(orderId: string, status: string, paymentId = 'payment-d1-1', amount = 29) {
  return { payment_id: paymentId, payment_status: status, order_id: orderId, price_amount: amount,
    price_currency: 'USD', pay_amount: amount, pay_currency: 'USDT' };
}
async function payloadHash(payload: Record<string, unknown>) {
  const canonical = canonicalizeNowPaymentsJson(payload);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function sendCallback(payload: Record<string, unknown>, signatureOverride?: string) {
  const signature = signatureOverride ?? await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), SECRET);
  return callbackPost(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
    method: 'POST', headers: { 'x-nowpayments-sig': signature }, body: JSON.stringify(payload),
  }));
}

beforeAll(async () => {
  // Explicitly local-only; no --remote flag is ever used by this integration suite.
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'cashclaw-db', '--local'], { stdio: 'ignore' });
  const d1Dir = path.resolve(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const dbFile = readdirSync(d1Dir).filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite').sort()[0];
  if (!dbFile) throw new Error(`Local Wrangler D1 SQLite file not found in ${d1Dir}`);
  db = new LocalD1Database(path.join(d1Dir, dbFile));
  holder.db = db as unknown as D1Database;
  vi.stubEnv('NOWPAYMENTS_IPN_SECRET', SECRET);
}, 30_000);
beforeEach(clearFixture, 15_000);
afterAll(async () => {
  if (db) await db.exec(`DROP TRIGGER IF EXISTS d1_test_fail_ipn_finalize;
    DROP TRIGGER IF EXISTS d1_test_fail_order_update;
    DELETE FROM saas_nowpayments_ipn_event_history WHERE order_id IN (SELECT order_id FROM saas_payment_orders WHERE workspace_id = '${WORKSPACE_ID}');
    DELETE FROM saas_nowpayments_ipn_events WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM saas_payment_orders WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM saas_bot_create_reservations WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM bots WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM bots WHERE workspace_id = 'd1-test-workspace-b';
    DELETE FROM saas_workspace_entitlements WHERE workspace_id IN ('${WORKSPACE_ID}', 'd1-test-workspace-b', 'd1-test-viewer-workspace');
    DELETE FROM saas_workspace_memberships WHERE workspace_id IN ('d1-test-workspace-b', 'd1-test-viewer-workspace');
    DELETE FROM saas_workspaces WHERE workspace_id IN ('d1-test-workspace-b', 'd1-test-viewer-workspace');
    DELETE FROM saas_workspace_memberships WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM saas_workspaces WHERE workspace_id = '${WORKSPACE_ID}';
    DELETE FROM user_sessions WHERE id IN ('d1-test-session', 'd1-test-session-b', 'd1-test-session-expired');`);
  holder.db = null;
  vi.unstubAllEnvs();
}, 30_000);

describe('NOWPayments callback and billing orders against Wrangler local D1 SQLite', () => {
  it('creates server-priced orders only for the session owner and rejects forged identity/workspace claims', async () => {
    const body = { workspaceId: WORKSPACE_ID, targetTier: 'MASTER' };
    const created = await createBillingOrder(new Request('https://app.example/api/ee/billing/orders', {
      method: 'POST', headers: { cookie: 'session_id=d1-test-session', 'x-user-id': 'd1-test-user-b', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    expect(created.status).toBe(201);
    const responseBody = await created.json() as { order: { orderId: string; ownerUserId?: string; priceAmount: number; targetTier: string; providerInvoiceCreated: boolean } };
    expect(responseBody.order).toMatchObject({ priceAmount: 299, targetTier: 'MASTER', providerInvoiceCreated: false });
    const storedOrder = await db.prepare('SELECT owner_user_id, price_amount FROM saas_payment_orders WHERE order_id = ?')
      .bind(responseBody.order.orderId).first<{ owner_user_id: string; price_amount: number }>();
    expect(storedOrder).toMatchObject({ owner_user_id: USER_ID, price_amount: 299 });

    const crossWorkspace = await createBillingOrder(new Request('https://app.example/api/ee/billing/orders', {
      method: 'POST', headers: { cookie: 'session_id=d1-test-session-b', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: WORKSPACE_ID, targetTier: 'PREMIUM' }),
    }));
    expect(crossWorkspace.status).toBe(404);
    const viewerCannotCreate = await createBillingOrder(new Request('https://app.example/api/ee/billing/orders', {
      method: 'POST', headers: { cookie: 'session_id=d1-test-session-b', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'd1-test-viewer-workspace', targetTier: 'PREMIUM' }),
    }));
    expect(viewerCannotCreate.status).toBe(403);
    const missingSession = await createBillingOrder(new Request('https://app.example/api/ee/billing/orders', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect(missingSession.status).toBe(401);
    const expiredSession = await createBillingOrder(new Request('https://app.example/api/ee/billing/orders', {
      method: 'POST', headers: { cookie: 'session_id=d1-test-session-expired', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    expect(expiredSession.status).toBe(401);
    const spoofedPrice = await createBillingOrder(new Request('https://app.example/api/ee/billing/orders', {
      method: 'POST', headers: { cookie: 'session_id=d1-test-session', 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, priceAmount: 0.01 }),
    }));
    expect(spoofedPrice.status).toBe(400);
    const malformedJson = await createBillingOrder(new Request('https://app.example/api/ee/billing/orders', {
      method: 'POST', headers: { cookie: 'session_id=d1-test-session', 'content-type': 'application/json' }, body: '{bad',
    }));
    expect(malformedJson.status).toBe(400);
  });

  it('rolls back order mutation and entitlement when final event/audit write fails, then retry succeeds', async () => {
    const order = await createOrder();
    const payload = paymentPayload(order.orderId, 'finished');
    await db.exec(`CREATE TRIGGER d1_test_fail_ipn_finalize BEFORE UPDATE ON saas_nowpayments_ipn_event_history
      WHEN NEW.processed = 1 BEGIN SELECT RAISE(FAIL, 'injected event finalization failure'); END;`);
    await expect(processVerifiedNowPaymentsEvent(db, payload as never, await payloadHash(payload), NOW + 10_000)).rejects.toThrow('injected event finalization failure');
    const orderAfterFailure = await db.prepare('SELECT status FROM saas_payment_orders WHERE order_id = ?').bind(order.orderId).first<{ status: string }>();
    expect(orderAfterFailure?.status).toBe('pending');
    expect(await db.prepare('SELECT COUNT(*) AS n FROM saas_nowpayments_ipn_event_history WHERE order_id = ?').bind(order.orderId).first<{ n: number }>()).toMatchObject({ n: 0 });
    expect((await getWorkspaceEntitlementForOwner(db, WORKSPACE_ID, USER_ID))?.tier).toBe('BASIC');

    await db.exec('DROP TRIGGER d1_test_fail_ipn_finalize;');
    const retry = await processVerifiedNowPaymentsEvent(db, payload as never, await payloadHash(payload), NOW + 20_000);
    expect(retry).toMatchObject({ accepted: true, replay: false, tier: 'PREMIUM', workspaceId: WORKSPACE_ID });
    expect((await getWorkspaceEntitlementForOwner(db, WORKSPACE_ID, USER_ID))?.tier).toBe('PREMIUM');
  });

  it('rolls back an inserted event when the order mutation fails', async () => {
    const order = await createOrder();
    const payload = paymentPayload(order.orderId, 'finished');
    await db.exec(`CREATE TRIGGER d1_test_fail_order_update BEFORE UPDATE ON saas_payment_orders
      BEGIN SELECT RAISE(FAIL, 'injected order mutation failure'); END;`);
    await expect(processVerifiedNowPaymentsEvent(db, payload as never, await payloadHash(payload), NOW + 30_000)).rejects.toThrow('injected order mutation failure');
    expect(await db.prepare('SELECT COUNT(*) AS n FROM saas_nowpayments_ipn_event_history WHERE order_id = ?').bind(order.orderId).first<{ n: number }>()).toMatchObject({ n: 0 });
    expect((await db.prepare('SELECT status FROM saas_payment_orders WHERE order_id = ?').bind(order.orderId).first<{ status: string }>())?.status).toBe('pending');
    await db.exec('DROP TRIGGER d1_test_fail_order_update;');
    const retry = await processVerifiedNowPaymentsEvent(db, payload as never, await payloadHash(payload), NOW + 31_000);
    expect(retry).toMatchObject({ accepted: true, replay: false, activated: true });
    expect((await getWorkspaceEntitlementForOwner(db, WORKSPACE_ID, USER_ID))?.tier).toBe('PREMIUM');
  });

  it('rejects amount, cross-order/cross-workspace binding mismatches and invalid HMAC', async () => {
    const orderA = await createOrder();
    const wrongAmount = paymentPayload(orderA.orderId, 'finished', 'payment-wrong-amount', 1);
    expect(await processVerifiedNowPaymentsEvent(db, wrongAmount as never, await payloadHash(wrongAmount), NOW + 40_000))
      .toMatchObject({ accepted: false });

    await db.batch([
      db.prepare(`INSERT INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms) VALUES (?, ?, 'active', ?)`)
        .bind('d1-test-workspace-b', 'd1-test-user-b', Date.now()),
      db.prepare(`INSERT INTO saas_workspace_memberships (workspace_id, user_id, role, status, expires_at_ms, created_at_ms) VALUES (?, ?, 'OWNER', 'active', NULL, ?)`)
        .bind('d1-test-workspace-b', 'd1-test-user-b', Date.now()),
      db.prepare(`INSERT INTO saas_workspace_entitlements (workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows, monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms) VALUES (?, ?, 'BASIC', 1, 4, 1000, 0, ?)`)
        .bind('d1-test-workspace-b', 'd1-test-user-b', Date.now()),
    ]);
    const orderB = await createPendingPaymentOrder(db, { workspaceId: 'd1-test-workspace-b', ownerUserId: 'd1-test-user-b', targetTier: 'PREMIUM' });
    const validA = paymentPayload(orderA.orderId, 'finished', 'payment-cross-binding');
    expect((await processVerifiedNowPaymentsEvent(db, validA as never, await payloadHash(validA), NOW + 41_000)).accepted).toBe(true);
    const reusedPayment = paymentPayload(orderB.orderId, 'finished', 'payment-cross-binding');
    expect(await processVerifiedNowPaymentsEvent(db, reusedPayment as never, await payloadHash(reusedPayment), NOW + 42_000))
      .toMatchObject({ accepted: false });
    expect((await getWorkspaceEntitlementForOwner(db, 'd1-test-workspace-b', 'd1-test-user-b'))?.tier).toBe('BASIC');

    const invalidSignature = await sendCallback(paymentPayload(orderA.orderId, 'finished', 'payment-invalid-sig'), '00');
    expect(invalidSignature.status).toBe(403);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM saas_nowpayments_ipn_event_history').first<{ n: number }>()).toMatchObject({ n: 1 });
    expect((await getWorkspaceEntitlementForOwner(db, WORKSPACE_ID, USER_ID))?.tier).toBe('PREMIUM');
  });

  it('serializes duplicate concurrent callbacks and preserves replay state after reopening D1', async () => {
    const order = await createOrder();
    const payload = paymentPayload(order.orderId, 'finished');
    const hash = await payloadHash(payload);
    const [first, second] = await Promise.all([
      processVerifiedNowPaymentsEvent(db, payload as never, hash, NOW + 50_000),
      processVerifiedNowPaymentsEvent(db, payload as never, hash, NOW + 50_001),
    ]);
    expect(first.accepted && second.accepted).toBe(true);
    expect([first.replay, second.replay].sort()).toEqual([false, true]);
    expect([first.activated, second.activated].sort()).toEqual([false, true]);

    const reopened = new LocalD1Database(db.dbPath);
    const entitlement = await getWorkspaceEntitlementForOwner(reopened, WORKSPACE_ID, USER_ID);
    const event = await reopened.prepare('SELECT processed FROM saas_nowpayments_ipn_event_history WHERE order_id = ?').bind(order.orderId).first<{ processed: number }>();
    expect(entitlement?.tier).toBe('PREMIUM');
    expect(event?.processed).toBe(1);

    const before = await reopened.prepare('SELECT expires_at_ms FROM saas_workspace_entitlements WHERE workspace_id = ?')
      .bind(WORKSPACE_ID).first<{ expires_at_ms: number }>();
    const changedBody = { ...payload, pay_amount: 28 };
    const semanticDuplicate = await processVerifiedNowPaymentsEvent(reopened, changedBody as never, await payloadHash(changedBody), NOW + 50_002);
    const after = await reopened.prepare('SELECT expires_at_ms FROM saas_workspace_entitlements WHERE workspace_id = ?')
      .bind(WORKSPACE_ID).first<{ expires_at_ms: number }>();
    expect(semanticDuplicate).toMatchObject({ accepted: true, replay: false, activated: false });
    expect(after?.expires_at_ms).toBe(before?.expires_at_ms);
  });

  it('extends an active monthly entitlement for a valid renewal without trusting callback tier', async () => {
    const firstOrder = await createOrder();
    const firstPayment = paymentPayload(firstOrder.orderId, 'finished', 'renewal-payment-1');
    await processVerifiedNowPaymentsEvent(db, firstPayment as never, await payloadHash(firstPayment), Date.now());
    const before = await db.prepare('SELECT expires_at_ms FROM saas_workspace_entitlements WHERE workspace_id = ?')
      .bind(WORKSPACE_ID).first<{ expires_at_ms: number }>();
    const renewalOrder = await createOrder();
    const renewal = paymentPayload(renewalOrder.orderId, 'finished', 'renewal-payment-2');
    const result = await processVerifiedNowPaymentsEvent(db, renewal as never, await payloadHash(renewal), Date.now());
    const after = await db.prepare('SELECT expires_at_ms FROM saas_workspace_entitlements WHERE workspace_id = ?')
      .bind(WORKSPACE_ID).first<{ expires_at_ms: number }>();
    expect(result.activated).toBe(true);
    expect(after?.expires_at_ms).toBe((before?.expires_at_ms ?? 0) + 30 * 24 * 60 * 60 * 1000);
  });

  it('handles out-of-order statuses monotonically and never reactivates a refunded payment', async () => {
    const order = await createOrder();
    const waiting = paymentPayload(order.orderId, 'waiting');
    await processVerifiedNowPaymentsEvent(db, waiting as never, await payloadHash(waiting), NOW + 60_000);
    const finished = paymentPayload(order.orderId, 'finished');
    await processVerifiedNowPaymentsEvent(db, finished as never, await payloadHash(finished), NOW + 61_000);
    const delayedConfirm = paymentPayload(order.orderId, 'confirming');
    await processVerifiedNowPaymentsEvent(db, delayedConfirm as never, await payloadHash(delayedConfirm), NOW + 62_000);
    expect((await db.prepare('SELECT status FROM saas_payment_orders WHERE order_id = ?').bind(order.orderId).first<{ status: string }>())?.status).toBe('finished');
    expect((await getWorkspaceEntitlementForOwner(db, WORKSPACE_ID, USER_ID))?.tier).toBe('PREMIUM');

    const refunded = paymentPayload(order.orderId, 'refunded');
    await processVerifiedNowPaymentsEvent(db, refunded as never, await payloadHash(refunded), NOW + 63_000);
    const lateFinished = paymentPayload(order.orderId, 'finished');
    const lateResult = await processVerifiedNowPaymentsEvent(db, lateFinished as never, await payloadHash(lateFinished), NOW + 64_000);
    expect(lateResult).toMatchObject({ accepted: true, status: 'refunded', activated: false });
    expect((await db.prepare('SELECT status FROM saas_payment_orders WHERE order_id = ?').bind(order.orderId).first<{ status: string }>())?.status).toBe('refunded');
    expect((await db.prepare('SELECT payment_status FROM saas_nowpayments_ipn_events WHERE payment_id = ?').bind('payment-d1-1').first<{ payment_status: string }>())?.payment_status).toBe('refunded');
    expect((await getWorkspaceEntitlementForOwner(db, WORKSPACE_ID, USER_ID))?.tier).toBe('BASIC');
  });

  it('treats failed/expired orders as terminal and refuses a later finished callback', async () => {
    const failedOrder = await createOrder();
    const failed = paymentPayload(failedOrder.orderId, 'failed', 'payment-failed-terminal');
    expect((await processVerifiedNowPaymentsEvent(db, failed as never, await payloadHash(failed), Date.now())).accepted).toBe(true);
    const lateSuccess = paymentPayload(failedOrder.orderId, 'finished', 'payment-failed-terminal');
    expect((await processVerifiedNowPaymentsEvent(db, lateSuccess as never, await payloadHash(lateSuccess), Date.now())).accepted).toBe(false);

    const expiredOrder = await createOrder();
    const expired = paymentPayload(expiredOrder.orderId, 'expired', 'payment-expired-terminal');
    expect((await processVerifiedNowPaymentsEvent(db, expired as never, await payloadHash(expired), Date.now())).accepted).toBe(true);
    const lateExpiredSuccess = paymentPayload(expiredOrder.orderId, 'finished', 'payment-expired-terminal');
    expect((await processVerifiedNowPaymentsEvent(db, lateExpiredSuccess as never, await payloadHash(lateExpiredSuccess), Date.now())).accepted).toBe(false);
    expect((await getWorkspaceEntitlementForOwner(db, WORKSPACE_ID, USER_ID))?.tier).toBe('BASIC');
  });

  it('reads entitlement from authenticated D1 membership and isolates user A from user B', async () => {
    const order = await createOrder();
    const payload = paymentPayload(order.orderId, 'finished');
    await processVerifiedNowPaymentsEvent(db, payload as never, await payloadHash(payload), Date.now());
    const ownerResponse = await entitlementGet(new Request(`https://app.example/api/ee/billing/nowpayments-ipn?workspaceId=${WORKSPACE_ID}`, {
      headers: { cookie: 'session_id=d1-test-session', 'x-user-id': 'd1-test-user-b' },
    }));
    expect(ownerResponse.status).toBe(200);
    expect(await ownerResponse.json()).toMatchObject({ ok: true, workspaceId: WORKSPACE_ID, tier: 'PREMIUM' });

    const otherUser = await entitlementGet(new Request(`https://app.example/api/ee/billing/nowpayments-ipn?workspaceId=${WORKSPACE_ID}`, {
      headers: { cookie: 'session_id=d1-test-session-b' },
    }));
    expect(otherUser.status).toBe(404);
    expect(await getWorkspaceEntitlementForOwner(db, WORKSPACE_ID, 'd1-test-user-b')).toBeUndefined();
  });

  it('uses atomic workspace reservations at the BASIC threshold despite concurrent requests', async () => {
    const context = workspaceContext();
    const [one, two] = await Promise.all([
      reserveWorkspaceBotSlot(context, 'concurrent-bot-a', 'hash-a'),
      reserveWorkspaceBotSlot(context, 'concurrent-bot-b', 'hash-b'),
    ]);
    expect([one.kind, two.kind].sort()).toEqual(['quota_exceeded', 'reserved']);
    const acceptedId = one.kind === 'reserved' ? 'concurrent-bot-a' : 'concurrent-bot-b';
    await insertBot(acceptedId, WORKSPACE_ID);
    await markBotReservationCreated(db, acceptedId, USER_ID);
    const actualCount = await db.prepare(`SELECT COUNT(*) AS n FROM bots WHERE workspace_id = ? AND status IN ('draft', 'paper_test', 'live_running', 'paused')`)
      .bind(WORKSPACE_ID).first<{ n: number }>();
    expect(actualCount?.n).toBe(1);
    expect((await reserveWorkspaceBotSlot(context, acceptedId, acceptedId.endsWith('a') ? 'hash-a' : 'hash-b')).kind).toBe('created');
    expect((await reserveWorkspaceBotSlot(context, acceptedId, 'different-hash')).kind).toBe('idempotency_conflict');
  });

  it('counts only selected active/draft states, isolates workspaces, and supports retry/idempotency', async () => {
    await insertBot('stopped-bot', WORKSPACE_ID, USER_ID, 'stopped');
    const context = workspaceContext();
    const first = await reserveWorkspaceBotSlot(context, 'retry-bot', 'same-hash');
    expect(first.kind).toBe('reserved');
    expect((await reserveWorkspaceBotSlot(context, 'retry-bot', 'same-hash')).kind).toBe('in_progress');
    expect((await reserveWorkspaceBotSlot(context, 'retry-bot', 'different-hash')).kind).toBe('idempotency_conflict');
    await releaseBotReservation(db, 'retry-bot', USER_ID);
    expect((await reserveWorkspaceBotSlot(context, 'retry-bot', 'same-hash')).kind).toBe('reserved');
    await releaseBotReservation(db, 'retry-bot', USER_ID);

    await insertBot('workspace-b-bot', 'd1-test-workspace-b', 'd1-test-user-b', 'draft');
    await db.batch([
      db.prepare(`INSERT INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms) VALUES (?, ?, 'active', ?)`)
        .bind('d1-test-workspace-b', 'd1-test-user-b', Date.now()),
      db.prepare(`INSERT INTO saas_workspace_memberships (workspace_id, user_id, role, status, expires_at_ms, created_at_ms) VALUES (?, ?, 'OWNER', 'active', NULL, ?)`)
        .bind('d1-test-workspace-b', 'd1-test-user-b', Date.now()),
      db.prepare(`INSERT INTO saas_workspace_entitlements (workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows, monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms) VALUES (?, ?, 'BASIC', 1, 4, 1000, 0, ?)`)
        .bind('d1-test-workspace-b', 'd1-test-user-b', Date.now()),
    ]);
    expect((await reserveWorkspaceBotSlot(context, 'workspace-a-bot', 'hash-a')).kind).toBe('reserved');
  });

  it('fails closed when stored entitlement owner disagrees with workspace owner', async () => {
    await db.prepare('UPDATE saas_workspace_entitlements SET owner_user_id = ? WHERE workspace_id = ?')
      .bind('d1-test-user-b', WORKSPACE_ID).run();
    await expect(resolveWorkspaceTierContext(new Request(`https://app.example/api/ee/quotas?workspaceId=${WORKSPACE_ID}`, {
      headers: { cookie: 'session_id=d1-test-session' },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('derives quota identity from the live D1 session, not forged user/tier/count headers', async () => {
    await insertBot('server-counted-bot', WORKSPACE_ID, USER_ID, 'draft');
    const resolved = await resolveWorkspaceTierContext(new Request(`https://app.example/api/bots?workspaceId=${WORKSPACE_ID}&tier=MASTER`, {
      headers: { cookie: 'session_id=d1-test-session', 'x-user-id': 'd1-test-user-b',
        'x-cashclaw-tier': 'MASTER', 'x-cashclaw-active-bots': '-999' },
    }));
    expect(resolved.userId).toBe(USER_ID);
    expect(resolved.tier).toBe('BASIC');
    expect(await reserveWorkspaceBotSlot(resolved, 'forged-header-bot', 'hash')).toMatchObject({ kind: 'quota_exceeded' });
  });

  it('reclaims expired reservations and blocks a newly active bot at quota', async () => {
    const context = workspaceContext();
    const now = Date.now();
    expect((await reserveWorkspaceBotSlot(context, 'expired-reservation', 'same-hash', now)).kind).toBe('reserved');
    expect((await reserveWorkspaceBotSlot(context, 'expired-reservation', 'same-hash', now + 120_001)).kind).toBe('reserved');
    await releaseBotReservation(db, 'expired-reservation', USER_ID);
    await insertBot('active-draft', WORKSPACE_ID, USER_ID, 'draft');
    expect((await reserveWorkspaceBotSlot(context, 'over-limit', 'new-hash')).kind).toBe('quota_exceeded');
  });
});
