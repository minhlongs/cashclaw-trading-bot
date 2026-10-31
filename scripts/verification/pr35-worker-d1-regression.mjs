import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const base = process.env.PR35_BASE_URL ?? 'http://127.0.0.1:8787';
const config = process.env.PR35_WRANGLER_CONFIG ?? '.wrangler/pr35-local.jsonc';
const persist = process.env.PR35_D1_PERSIST ?? '.wrangler/verification/pr35-d1-worker';
const database = process.env.PR35_D1_NAME ?? 'pr35-isolated-local';
const secretFile = process.env.PR35_SECRET_FILE ?? '.wrangler/verification/pr35-worker.dev.vars';
const resultsFile = process.env.PR35_RESULTS_FILE ?? '.wrangler/verification/pr35-worker-runtime-results.json';
const parsedBase = new URL(base);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsedBase.hostname), 'Refusing to send synthetic test traffic to a non-loopback host');
const ipnSecret = readFileSync(secretFile, 'utf8').match(/^NOWPAYMENTS_IPN_SECRET=(.+)$/m)?.[1];
assert.ok(ipnSecret, 'ephemeral local callback secret must exist');
const results = [];
function record(name, detail = {}) { results.push({ name, ...detail }); console.log(`PASS ${name}`); }
function query(sql) {
  const run = spawnSync('npx', ['wrangler', 'd1', 'execute', database, '--config', config, '--local', '--persist-to', persist, '--command', sql, '--json'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`D1 local query failed (${run.status}): ${run.stderr}`);
  const parsed = JSON.parse(run.stdout);
  return parsed.flatMap((result) => result.results ?? []);
}
function q(value) { return `'${String(value).replaceAll("'", "''")}'`; }
async function request(path, { method = 'GET', cookie, headers = {}, body } = {}) {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  if (!response) throw lastError;
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { response, text, json };
}
async function login(email, passcode) {
  const { response, json } = await request('/api/auth/login', { method: 'POST', body: { email, passcode } });
  assert.equal(response.status, 200, `login failed: ${response.status} ${JSON.stringify(json)}`);
  const cookie = response.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('session_id='));
  assert.ok(cookie, 'login returned no session cookie');
  return cookie;
}
async function callback(payload, { signature = true } = {}) {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b))));
  const sig = signature ? createHmac('sha512', ipnSecret).update(canonical).digest('hex') : '00'.repeat(64);
  return request('/api/ee/billing/nowpayments-ipn', { method: 'POST', headers: { 'x-nowpayments-sig': sig }, body: payload });
}
function validBot(id, workspaceId) {
  return { id, name: id, strategy: 'grid', pair: 'BTC/USDT', exchange: 'binance', capital: 100, mode: 'paper', workspaceId };
}
function entitlements(workspaceId) {
  return query(`SELECT workspace_id,tier,max_running_bots,expires_at_ms,revoked_at_ms,current_payment_id FROM saas_workspace_entitlements WHERE workspace_id=${q(workspaceId)}`)[0];
}

const health = await request('/api/health');
assert.equal(health.response.status, 200);
assert.equal(health.json?.checks?.db, 'ok');
record('OpenNext Worker reports D1 binding healthy', { checks: health.json.checks });

const [cookieA, cookieB] = await Promise.all([
  login('pr35-a@example.test', process.env.PR35_USER_A_PASSCODE ?? 'Temporary-A-Only-2026'),
  login('pr35-b@example.test', process.env.PR35_USER_B_PASSCODE ?? 'Temporary-B-Only-2026'),
]);
record('synthetic users A/B authenticated over Worker HTTP');

for (const [locale, expected] of [['vi', 'Vận hành OPC'], ['en', 'OPC Operations']]) {
  const { response, text } = await request(`/${locale}/operations`, { cookie: locale === 'vi' ? cookieA : cookieB });
  assert.equal(response.status, 200);
  assert.ok(text.includes(expected), `localized SSR text missing: ${expected}`);
}
record('Vietnamese and English Operations route render over Worker HTTP; UI interactions remain browser-only');

const wsA = 'personal:pr35-user-a';
const wsB = 'personal:pr35-user-b';
for (const [cookie, ws] of [[cookieA, wsA], [cookieB, wsB]]) {
  const list = await request('/api/bots', { cookie });
  assert.equal(list.response.status, 200, list.text);
  const row = entitlements(ws);
  assert.equal(row?.tier, 'BASIC');
}
record('D1 binding auto-provisions isolated BASIC personal workspaces for A/B');

const forgedRead = await request(`/api/bots?workspaceId=${encodeURIComponent(wsB)}`, {
  cookie: cookieA,
  headers: { 'x-user-id': 'pr35-user-b', 'x-cashclaw-tier': 'MASTER', 'x-cashclaw-active-bot-count': '0' },
});
assert.equal(forgedRead.response.status, 404);
const forgedBilling = await request(`/api/ee/billing/nowpayments-ipn?workspaceId=${encodeURIComponent(wsB)}`, {
  cookie: cookieA, headers: { 'x-user-id': 'pr35-user-b', 'x-cashclaw-tier': 'MASTER' },
});
assert.equal(forgedBilling.response.status, 404);
record('forged identity/tier/count and cross-workspace reads fail closed', { botReadStatus: 404, billingReadStatus: 404 });

const emptyA = await request('/api/ops/work-items', { cookie: cookieA });
const emptyB = await request('/api/ops/work-items', { cookie: cookieB });
assert.equal(emptyA.response.status, 200); assert.equal(emptyB.response.status, 200);
assert.equal(emptyA.json.items.length, 0); assert.equal(emptyB.json.items.length, 0);
const createdOps = await request('/api/ops/work-items', { method: 'POST', cookie: cookieA, body: { department: 'operations', title: 'runtime restart regression', description: 'Synthetic only', amountMinor: null, dueDate: null } });
assert.equal(createdOps.response.status, 201, createdOps.text);
const opsId = createdOps.json.item.id;
const bOps = await request('/api/ops/work-items', { cookie: cookieB });
assert.equal(bOps.json.items.some((item) => item.id === opsId), false);
assert.equal((await request(`/api/ops/work-items/${opsId}`, { cookie: cookieB })).response.status, 404);
const moved = await request(`/api/ops/work-items/${opsId}`, { method: 'PATCH', cookie: cookieA, body: { status: 'in_progress' } });
assert.equal(moved.response.status, 200);
const history = await request(`/api/ops/work-items/${opsId}`, { cookie: cookieA });
assert.equal(history.json.events.length, 2);
const races = await Promise.all(['done', 'cancelled'].map((status) => request(`/api/ops/work-items/${opsId}`, { method: 'PATCH', cookie: cookieA, body: { status } })));
assert.deepEqual(races.map((x) => x.response.status).sort(), [200, 409]);
const opsReadback = query(`SELECT status,version FROM ops_work_items WHERE id=${q(opsId)}`)[0];
assert.equal(opsReadback.version, 2);
const eventReadback = query(`SELECT COUNT(*) AS count FROM ops_work_item_events WHERE item_id=${q(opsId)}`)[0];
assert.equal(eventReadback.count, 3);
record('Operations create, owner isolation, status history and compare-and-swap conflict over Worker/D1', { finalStatus: opsReadback.status, version: opsReadback.version, historyEvents: eventReadback.count, raceStatuses: races.map((x) => x.response.status) });

const failBotId = 'pr35-fault-bot-write';
query(`CREATE TRIGGER pr35_fail_bot_insert BEFORE INSERT ON bots WHEN NEW.id=${q(failBotId)} BEGIN SELECT RAISE(ABORT,'synthetic persistence failure'); END`);
const failCreate = await request('/api/bots', { method: 'POST', cookie: cookieB, body: validBot(failBotId, wsB) });
query('DROP TRIGGER pr35_fail_bot_insert');
assert.equal(failCreate.response.status, 503, failCreate.text);
assert.equal(query(`SELECT COUNT(*) AS count FROM bots WHERE id=${q(failBotId)}`)[0].count, 0);
assert.equal(query(`SELECT COUNT(*) AS count FROM saas_bot_create_reservations WHERE bot_id=${q(failBotId)}`)[0].count, 0);
record('bot persistence fault returns 503 and releases reservation; no DB bot or active reservation remains');

const candidates = Array.from({ length: 8 }, (_, i) => `pr35-quota-${i}`);
const quotaResponses = await Promise.all(candidates.map((id) => request('/api/bots', {
  method: 'POST', cookie: cookieA, body: validBot(id, wsA),
})));
const created = quotaResponses.filter((x) => x.response.status === 201);
assert.equal(created.length, 1, `expected one bot create at BASIC cap; got ${quotaResponses.map((x) => x.response.status)}`);
assert.ok(quotaResponses.every((x) => [201, 403].includes(x.response.status)), quotaResponses.map((x) => x.response.status).join(','));
const winnerId = created[0].json.data.id;
const persistedBots = query(`SELECT id,status,workspace_id,user_id FROM bots WHERE workspace_id=${q(wsA)} AND status IN ('draft','paper_test','live_running','paused')`);
assert.equal(persistedBots.length, 1);
assert.equal(persistedBots[0].id, winnerId);
const runtimeList = await request('/api/bots', { cookie: cookieA });
assert.equal(runtimeList.response.status, 200);
assert.equal(runtimeList.json.data.filter((x) => x.id === winnerId).length, 1);
const replay = await request('/api/bots', { method: 'POST', cookie: cookieA, body: validBot(winnerId, wsA) });
assert.equal(replay.response.status, 200); assert.equal(replay.json.idempotentReplay, true);
const spoofedQuota = await request('/api/bots', { method: 'POST', cookie: cookieA,
  headers: { 'x-user-id': 'pr35-user-b', 'x-cashclaw-tier': 'MASTER', 'x-cashclaw-active-bot-count': '0' },
  body: validBot('pr35-spoof-quota', wsA),
});
assert.equal(spoofedQuota.response.status, 403);
record('quota under 8-way concurrent HTTP create: exactly one PAPER bot persisted and listed; retries idempotent; spoofed MASTER/count cannot raise BASIC cap', { statuses: quotaResponses.map((x) => x.response.status), persistedCount: persistedBots.length, winnerId });

async function createOrder(cookie, workspaceId, targetTier = 'PREMIUM') {
  const r = await request('/api/ee/billing/orders', { method: 'POST', cookie, body: { workspaceId, targetTier } });
  assert.equal(r.response.status, 201, r.text);
  return r.json.order;
}
function payload(order, paymentId, paymentStatus, overrides = {}) {
  return { payment_id: paymentId, payment_status: paymentStatus, order_id: order.orderId,
    price_amount: order.priceAmount, price_currency: order.priceCurrency,
    pay_amount: 0.0005, pay_currency: 'BTC', ...overrides };
}

const orderA = await createOrder(cookieA, wsA);
const invalid = await callback(payload(orderA, 'pr35-invalid-payment', 'finished'), { signature: false });
assert.equal(invalid.response.status, 403);
assert.equal(query(`SELECT COUNT(*) AS count FROM saas_nowpayments_ipn_event_history WHERE order_id=${q(orderA.orderId)}`)[0].count, 0);
const mismatch = await callback(payload({ ...orderA, priceAmount: orderA.priceAmount + 1 }, 'pr35-mismatch-payment', 'finished'));
assert.equal(mismatch.response.status, 404);
assert.equal(query(`SELECT status,provider_payment_id FROM saas_payment_orders WHERE order_id=${q(orderA.orderId)}`)[0].provider_payment_id, null);
record('callback invalid HMAC and signed amount-binding mismatch produce no event/order mutation', { invalidSignatureStatus: 403, bindingMismatchStatus: 404 });

const waitingPayload = payload(orderA, 'pr35-payment-seq-a', 'waiting');
const waiting = await callback(waitingPayload);
assert.equal(waiting.response.status, 200); assert.equal(waiting.json.paymentStatus, 'waiting');
const finishedPayload = payload(orderA, 'pr35-payment-seq-a', 'finished');
const finishes = await Promise.all(Array.from({ length: 5 }, () => callback(finishedPayload)));
assert.ok(finishes.every((x) => x.response.status === 200), finishes.map((x) => x.response.status).join(','));
assert.equal(finishes.filter((x) => x.json.activated).length, 1);
const outOfOrder = await callback(payload(orderA, 'pr35-payment-seq-a', 'waiting', { pay_amount: 0.0006 }));
assert.equal(outOfOrder.response.status, 200);
assert.equal(outOfOrder.json.paymentStatus, 'finished');
assert.equal(outOfOrder.json.activated, false);
assert.equal(entitlements(wsA).tier, 'PREMIUM');
const duplicate = await callback(finishedPayload);
assert.equal(duplicate.response.status, 200); assert.equal(duplicate.json.idempotentReplay, true); assert.equal(duplicate.json.activated, false);
record('signed callback waiting→finished concurrent duplicate→out-of-order waiting; single activation, monotonic stored status', { concurrentResponses: finishes.length, activatedCount: finishes.filter((x) => x.json.activated).length, finalCallbackStatus: outOfOrder.json.paymentStatus });

const orderB = await createOrder(cookieB, wsB);
const eventFaultPayload = payload(orderB, 'pr35-event-fault-payment', 'finished');
query(`CREATE TRIGGER pr35_fail_ipn_event BEFORE INSERT ON saas_nowpayments_ipn_event_history WHEN NEW.order_id=${q(orderB.orderId)} BEGIN SELECT RAISE(ABORT,'synthetic event write failure'); END`);
const eventFault = await callback(eventFaultPayload);
query('DROP TRIGGER pr35_fail_ipn_event');
assert.equal(eventFault.response.status, 503);
assert.equal(query(`SELECT status,provider_payment_id FROM saas_payment_orders WHERE order_id=${q(orderB.orderId)}`)[0].status, 'pending');
assert.equal(query(`SELECT COUNT(*) AS count FROM saas_nowpayments_ipn_event_history WHERE order_id=${q(orderB.orderId)}`)[0].count, 0);
assert.equal(entitlements(wsB).tier, 'BASIC');
const eventRetry = await callback(eventFaultPayload);
assert.equal(eventRetry.response.status, 200); assert.equal(eventRetry.json.activated, true);
record('callback event-write fault rolls back order/entitlement and same signed retry activates after trigger removal');

const orderC = await createOrder(cookieB, wsB, 'ENTERPRISE');
const mutationFaultPayload = payload(orderC, 'pr35-mutation-fault-payment', 'finished');
query(`CREATE TRIGGER pr35_fail_order_update BEFORE UPDATE ON saas_payment_orders WHEN OLD.order_id=${q(orderC.orderId)} AND NEW.status='finished' BEGIN SELECT RAISE(ABORT,'synthetic order mutation failure'); END`);
const mutationFault = await callback(mutationFaultPayload);
query('DROP TRIGGER pr35_fail_order_update');
assert.equal(mutationFault.response.status, 503);
assert.equal(query(`SELECT status,provider_payment_id FROM saas_payment_orders WHERE order_id=${q(orderC.orderId)}`)[0].status, 'pending');
assert.equal(query(`SELECT COUNT(*) AS count FROM saas_nowpayments_ipn_event_history WHERE order_id=${q(orderC.orderId)}`)[0].count, 0);
assert.equal(entitlements(wsB).tier, 'PREMIUM'); // prior successful B payment remains, C did not mutate it
const mutationRetry = await callback(mutationFaultPayload);
assert.equal(mutationRetry.response.status, 200);
assert.equal(mutationRetry.json.activated, true);
record('callback order-mutation fault rolls back inserted event; retry activates after trigger removal');

const refund = await callback(payload(orderA, 'pr35-payment-seq-a', 'refunded'));
assert.equal(refund.response.status, 200);
assert.equal(query(`SELECT status FROM saas_payment_orders WHERE order_id=${q(orderA.orderId)}`)[0].status, 'refunded');
assert.equal(entitlements(wsA).tier, 'BASIC');
record('refund callback persists terminal state and reduces current entitlement to BASIC');

writeFileSync(resultsFile, JSON.stringify({
  generatedAt: new Date().toISOString(), base, workerEnvironment: 'local Wrangler/OpenNext, D1 binding local',
  checks: results, operationsItemId: opsId, winningBotId: winnerId,
  syntheticOrderIds: [orderA.orderId, orderB.orderId, orderC.orderId],
  note: 'HTTP-to-Worker with isolated local D1 binding. No cookies, passwords, signatures, or secret values written.',
}, null, 2));
console.log(`RESULTS ${resultsFile} (${results.length} checks)`);
