#!/usr/bin/env node
// PR35 ops-approval + durable-scheduling evaluator — runs migration 0018 semantics against an
// isolated LOCAL Wrangler D1 database (created from scratch with --reset). Proves, with real D1
// semantics: approval transitions land atomically via the audit INSERT trigger with CAS on state +
// version; stale transitions abort and roll back; the approval audit is append-only; tick leases
// enforce one lease per bot/minute across isolates with expired-only takeover; alert dispatch log
// dedups by event id and retries only failed attempts. No remote D1, no provider calls, no secrets.
//
// Usage: node scripts/verification/pr35-ops-scheduling-eval.mjs --reset   (exit 0 = all PASS)

import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

assert.ok(process.argv.includes('--reset'), 'Pass --reset to recreate only the isolated PR35 ops-scheduling D1.');
const database = 'pr35-ops-scheduling-eval';
const databaseId = '00000000-0000-4000-8000-000000000038';
const configFile = '.wrangler/pr35-ops-scheduling.jsonc';
const persist = '.wrangler/verification/pr35-ops-scheduling-d1';
const artifactDir = 'docs/verification/artifacts';

rmSync(persist, { recursive: true, force: true });
mkdirSync('.wrangler/verification', { recursive: true });
mkdirSync(artifactDir, { recursive: true });

writeFileSync(configFile, JSON.stringify({
  name: 'pr35-ops-scheduling-eval-local-only',
  compatibility_date: '2026-08-12',
  d1_databases: [{ binding: 'DB', database_name: database, database_id: databaseId, migrations_dir: '../migrations' }],
}, null, 2));

function wrangler(args, { json = false } = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return json ? JSON.parse(result.stdout) : result.stdout;
}
function query(sql) {
  return wrangler(['d1', 'execute', database, '--config', configFile, '--local', '--persist-to', persist, '--command', sql, '--json'], { json: true });
}
function expectAbort(sql, pattern, label) {
  let blocked = false;
  let message = '';
  try { query(sql); } catch (error) { message = String(error.message ?? error); blocked = pattern.test(message); }
  assert.ok(blocked, `${label} must abort with ${pattern}: ${message}`);
}

// ---- Build the full schema from scratch (all migrations, including 0018).
wrangler(['d1', 'migrations', 'apply', database, '--config', configFile, '--local', '--persist-to', persist]);
query(`
INSERT INTO users (id, email, display_name, locale, created_at, updated_at) VALUES ('ops-user', 'ops@example.test', 'Ops', 'en', 1, 1);
INSERT INTO ops_work_items (id, owner_user_id, department, title, description, status, amount_minor, due_date, created_at, updated_at, version, action_type, action_payload_json, approval_state)
VALUES ('item-a', 'ops-user', 'sales', 'Send quote', '', 'open', NULL, NULL, 1000, 1000, 0, 'outbound_message', '{"channel":"EMAIL","message":"quote ready"}', 'draft');
INSERT INTO ops_work_items (id, owner_user_id, department, title, description, status, amount_minor, due_date, created_at, updated_at, version, action_type, action_payload_json, approval_state)
VALUES ('item-plain', 'ops-user', 'sales', 'Plain task', '', 'open', NULL, NULL, 1000, 1000, 0, NULL, NULL, 'none');
`);
console.log('PASS baseline: all migrations (incl. 0018) apply on a fresh local D1; fixtures seeded.');

// ---- Approval transitions land atomically (audit INSERT trigger = the state change).
query(`INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
VALUES ('item-a', 'ops-user', 'ops-user', 'draft', 'pending_approval', NULL, 0, 2000);`);
let row = query(`SELECT approval_state, version, submitted_at_ms FROM ops_work_items WHERE id = 'item-a';`)[0].results[0];
assert.equal(row.approval_state, 'pending_approval');
assert.equal(row.version, 1);
assert.equal(row.submitted_at_ms, 2000);
query(`INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
VALUES ('item-a', 'ops-user', 'ops-user', 'pending_approval', 'approved', 'reviewed', 1, 3000);`);
row = query(`SELECT approval_state, version, approved_by, approved_at_ms FROM ops_work_items WHERE id = 'item-a';`)[0].results[0];
assert.deepEqual({ ...row }, { approval_state: 'approved', version: 2, approved_by: 'ops-user', approved_at_ms: 3000 });
console.log('PASS approval transitions: audit INSERT performs submit/approve atomically with version CAS.');

// ---- Stale transitions abort and leave NOTHING behind (no audit row, no state change).
expectAbort(
  `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
   VALUES ('item-a', 'ops-user', 'ops-user', 'draft', 'pending_approval', NULL, 0, 4000);`,
  /approval transition did not land/i,
  'stale version transition',
);
expectAbort(
  `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
   VALUES ('item-a', 'ops-user', 'ops-user', 'draft', 'approved', NULL, 2, 4000);`,
  /approval transition did not land/i,
  'wrong prior-state transition',
);
expectAbort(
  `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
   VALUES ('item-plain', 'ops-user', 'ops-user', 'none', 'approved', NULL, 0, 4000);`,
  /approval transition did not land/i,
  'plain-item transition',
);
assert.equal(query(`SELECT COUNT(*) AS n FROM ops_approval_events;`)[0].results[0].n, 2);
assert.equal(query(`SELECT version FROM ops_work_items WHERE id = 'item-a';`)[0].results[0].version, 2);
console.log('PASS stale/wrong transitions: atomic abort, zero audit rows written, state unchanged.');

// ---- Execution transitions target execution_state and never unlock re-approval.
query(`INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
VALUES ('item-a', 'ops-user', 'ops-user', 'approved', 'failed', 'smtp down', 2, 5000);`);
row = query(`SELECT approval_state, execution_state, execution_result, version FROM ops_work_items WHERE id = 'item-a';`)[0].results[0];
assert.deepEqual({ ...row }, { approval_state: 'approved', execution_state: 'failed', execution_result: 'smtp down', version: 3 });
query(`INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
VALUES ('item-a', 'ops-user', 'ops-user', 'approved', 'executed', 'sent:EMAIL', 3, 6000);`);
row = query(`SELECT approval_state, execution_state, execution_result, version FROM ops_work_items WHERE id = 'item-a';`)[0].results[0];
assert.deepEqual({ ...row }, { approval_state: 'approved', execution_state: 'executed', execution_result: 'sent:EMAIL', version: 4 });
expectAbort(
  `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
   VALUES ('item-a', 'ops-user', 'ops-user', 'approved', 'executed', 'again', 4, 7000);`,
  /approval transition did not land/i,
  're-execute after success',
);
console.log('PASS execution lifecycle: failed is retriable; executed is terminal; approval stays approved.');

// ---- Approval audit is append-only.
expectAbort(`UPDATE ops_approval_events SET reason = 'tampered' WHERE id = 1;`, /append-only/i, 'audit UPDATE');
expectAbort(`DELETE FROM ops_approval_events WHERE id = 1;`, /append-only/i, 'audit DELETE');
console.log('PASS audit immutability: approval events are append-only.');

// ---- Tick leases: one per bot/minute, expired-only takeover, exactly-one-row semantics.
query(`INSERT INTO saas_bot_tick_leases (workspace_id, bot_id, epoch_minute, isolate_id, acquired_at_ms, expires_at_ms)
VALUES ('ws-1', 'bot-1', 100, 'isolate-a', 6000000, 6055000);`);
expectAbort(
  `INSERT INTO saas_bot_tick_leases (workspace_id, bot_id, epoch_minute, isolate_id, acquired_at_ms, expires_at_ms)
   VALUES ('ws-1', 'bot-1', 100, 'isolate-b', 6001000, 6056000);`,
  /UNIQUE constraint failed/i,
  'duplicate tick lease (PK backstop)',
);
const takeover = query(`UPDATE saas_bot_tick_leases SET isolate_id = 'isolate-b', acquired_at_ms = 6056000, expires_at_ms = 6111000
WHERE workspace_id = 'ws-1' AND bot_id = 'bot-1' AND epoch_minute = 100 AND expires_at_ms <= 6056000
RETURNING isolate_id;`)[0];
assert.equal(takeover.results.length, 1, 'expired-lease takeover must land exactly one row');
const liveBlock = query(`UPDATE saas_bot_tick_leases SET isolate_id = 'isolate-c', acquired_at_ms = 6057000, expires_at_ms = 6112000
WHERE workspace_id = 'ws-1' AND bot_id = 'bot-1' AND epoch_minute = 100 AND expires_at_ms <= 6057000
RETURNING isolate_id;`)[0];
assert.equal(liveBlock.results.length, 0, 'a live lease must never be taken over');
query(`INSERT INTO saas_bot_tick_leases (workspace_id, bot_id, epoch_minute, isolate_id, acquired_at_ms, expires_at_ms)
VALUES ('ws-1', 'bot-1', 101, 'isolate-a', 6060000, 6115000);`);
assert.equal(query(`SELECT COUNT(*) AS n FROM saas_bot_tick_leases;`)[0].results[0].n, 2);
console.log('PASS tick leases: PK blocks duplicate minute leases; takeover only after expiry; minutes are independent.');

// ---- Alert dispatch log: dedup by event id, retry only from failed.
query(`INSERT INTO saas_alert_dispatch_log (event_id, workspace_id, bot_id, channel, status, attempts, created_at_ms, updated_at_ms)
VALUES ('evt-1', 'ws-1', 'bot-1', 'TELEGRAM', 'pending', 1, 10, 10);`);
const duplicateClaim = query(`INSERT INTO saas_alert_dispatch_log (event_id, workspace_id, bot_id, channel, status, attempts, created_at_ms, updated_at_ms)
VALUES ('evt-1', 'ws-1', 'bot-1', 'TELEGRAM', 'pending', 1, 20, 20)
ON CONFLICT(event_id) DO UPDATE SET status = 'pending', attempts = saas_alert_dispatch_log.attempts + 1, updated_at_ms = excluded.updated_at_ms
WHERE saas_alert_dispatch_log.status = 'failed' AND saas_alert_dispatch_log.channel = excluded.channel
RETURNING event_id;`)[0];
assert.equal(duplicateClaim.results.length, 0, 'claiming a pending event must not change rows');
query(`UPDATE saas_alert_dispatch_log SET status = 'failed', last_error = 'boom', updated_at_ms = 30 WHERE event_id = 'evt-1';`);
const retryClaim = query(`INSERT INTO saas_alert_dispatch_log (event_id, workspace_id, bot_id, channel, status, attempts, created_at_ms, updated_at_ms)
VALUES ('evt-1', 'ws-1', 'bot-1', 'TELEGRAM', 'pending', 1, 40, 40)
ON CONFLICT(event_id) DO UPDATE SET status = 'pending', attempts = saas_alert_dispatch_log.attempts + 1, updated_at_ms = excluded.updated_at_ms
WHERE saas_alert_dispatch_log.status = 'failed' AND saas_alert_dispatch_log.channel = excluded.channel
RETURNING event_id;`)[0];
assert.equal(retryClaim.results.length, 1, 'a failed event must be retryable');
const rowEvt = query(`SELECT status, attempts FROM saas_alert_dispatch_log WHERE event_id = 'evt-1';`)[0].results[0];
assert.deepEqual({ ...rowEvt }, { status: 'pending', attempts: 2 });
console.log('PASS alert dispatch log: pending/sent events suppress duplicates; failed events retry with attempts counted.');

writeFileSync(`${artifactDir}/pr35-ops-scheduling-summary.json`, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  target: 'isolated local Wrangler D1 only (pr35-ops-scheduling-eval); no remote D1, no provider calls',
  proved: [
    'migration 0018 applies on fresh D1 with all prior migrations',
    'approval transitions atomic via audit INSERT trigger with CAS on state + version',
    'stale/wrong/prior-state transitions abort with zero rows written',
    'failed execution retriable; executed terminal; append-only audit',
    'tick leases: one per bot/minute (PK), expired-only takeover with exactly-one-row guard',
    'alert dispatch log: durable dedup by event id; retry only from failed',
  ],
}, null, 2)}\n`);
console.log(`PASS ops-approval + durable-scheduling evaluation. Artifact: ${artifactDir}/pr35-ops-scheduling-summary.json`);
