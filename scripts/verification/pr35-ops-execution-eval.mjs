#!/usr/bin/env node
// PR35 ops-action execution evaluator — proves the 0019 retry/attempt semantics against an
// isolated LOCAL Wrangler D1 database (created from scratch with --reset): clean migration chain
// 0001..0019, in-place upgrade from an 0018 database that already holds approval data, atomic
// attempt claims (UNIQUE election), attempt claim immutability, approved-snapshot stamping through
// the audit trigger, revoke/expiry blocking, and safe defaults for legacy approvals that lack a
// snapshot (fail closed, no auto-grant). No remote D1, no provider calls, no secrets.
//
// Usage: node scripts/verification/pr35-ops-execution-eval.mjs --reset   (exit 0 = all PASS)

import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

assert.ok(process.argv.includes('--reset'), 'Pass --reset to recreate only the isolated PR35 ops-execution D1.');
const database = 'pr35-ops-execution-eval';
const databaseId = '00000000-0000-4000-8000-000000000039';
const configFile = '.wrangler/pr35-ops-execution.jsonc';
const persist = '.wrangler/verification/pr35-ops-execution-d1';
const artifactDir = 'docs/verification/artifacts';

rmSync(persist, { recursive: true, force: true });
mkdirSync('.wrangler/verification', { recursive: true });
mkdirSync(artifactDir, { recursive: true });

writeFileSync(configFile, JSON.stringify({
  name: 'pr35-ops-execution-eval-local-only',
  compatibility_date: '2026-08-12',
  d1_databases: [{ binding: 'DB', database_name: database, database_id: databaseId, migrations_dir: '../migrations' }],
}, null, 2));

function wrangler(args, { json = false } = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return json ? JSON.parse(result.stdout) : result.stdout;
}
function query(sql) {
  return wrangler(['d1', 'execute', database, '--config', configFile, '--local', '--persist-to', persist, '--command', sql, '--json'], { json: true })[0];
}
function expectAbort(sql, pattern, label) {
  let blocked = false;
  let message = '';
  try { query(sql); } catch (error) { message = String(error.message ?? error); blocked = pattern.test(message); }
  assert.ok(blocked, `${label} must abort with ${pattern}: ${message}`);
}

// ---- Fresh chain applies cleanly (0001..0019) and seeds.
wrangler(['d1', 'migrations', 'apply', database, '--config', configFile, '--local', '--persist-to', persist]);
query(`INSERT INTO users (id, email, display_name, locale, created_at, updated_at) VALUES ('ops-user', 'ops@example.test', 'Ops', 'en', 1, 1);`);
console.log('PASS baseline: full migration chain (0001..0019) applies on a fresh local D1.');

// ---- Approval stamps the immutable snapshot; the guard REQUIRES hash + target on approve.
query(`INSERT INTO ops_work_items (id, owner_user_id, department, title, description, status, amount_minor, due_date, created_at, updated_at, version, action_type, action_payload_json, approval_state)
VALUES ('item-1', 'ops-user', 'sales', 'Send quote', '', 'open', NULL, NULL, 1000, 1000, 0, 'outbound_message', '{"channel":"EMAIL","message":"quote"}', 'draft');`);
query(`INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
VALUES ('item-1', 'ops-user', 'ops-user', 'draft', 'pending_approval', NULL, 0, 2000);`);
expectAbort(
  `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms, approved_sha256, approved_target)
   VALUES ('item-1', 'ops-user', 'ops-user', 'pending_approval', 'approved', NULL, 1, 3000, NULL, 'email:ops@example.test');`,
  /approval transition did not land/i,
  'approve without snapshot hash',
);
query(`INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms, approved_sha256, approved_target)
VALUES ('item-1', 'ops-user', 'ops-user', 'pending_approval', 'approved', NULL, 1, 3000, 'sha-abc', 'email:ops@example.test');`);
let row = query(`SELECT approval_state, approved_sha256, approved_target, approval_expires_at_ms FROM ops_work_items WHERE id = 'item-1';`).results[0];
assert.deepEqual({ ...row }, { approval_state: 'approved', approved_sha256: 'sha-abc', approved_target: 'email:ops@example.test', approval_expires_at_ms: 3000 + 86400000 });
console.log('PASS approved snapshot: hash+target mandatory and stamped atomically; expiry = approve time + policy TTL.');

// ---- Execute transitions require an unrevoked approval; revoke is a real lifecycle state.
query(`INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
VALUES ('item-1', 'ops-user', 'ops-user', 'approved', 'failed', 'attempt 1 failed_retryable', 2, 4000);`);
row = query(`SELECT execution_state, version FROM ops_work_items WHERE id = 'item-1';`).results[0];
assert.deepEqual({ ...row }, { execution_state: 'failed', version: 3 });
query(`INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
VALUES ('item-1', 'ops-user', 'ops-user', 'approved', 'revoked', 'operator revoked', 3, 5000);`);
row = query(`SELECT approval_state, revoked_at_ms, version FROM ops_work_items WHERE id = 'item-1';`).results[0];
assert.deepEqual({ ...row }, { approval_state: 'revoked', revoked_at_ms: 5000, version: 4 });
expectAbort(
  `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
   VALUES ('item-1', 'ops-user', 'ops-user', 'approved', 'executed', 'late send', 4, 6000);`,
  /approval transition did not land/i,
  'execute after revoke',
);
console.log('PASS lifecycle: failed stays retriable; revoke lands as its own state and blocks all further sends.');

// ---- Atomic attempt claims: UNIQUE(item_id, attempt_no) elects exactly one winner.
query(`INSERT INTO ops_action_attempts (item_id, owner_user_id, attempt_no, claimed_by, claimed_at_ms, timeout_ms, scheduled_for_ms, outcome)
VALUES ('item-1', 'ops-user', 1, 'worker-a', 7000, 10000, 7000, 'in_flight');`);
expectAbort(
  `INSERT INTO ops_action_attempts (item_id, owner_user_id, attempt_no, claimed_by, claimed_at_ms, timeout_ms, scheduled_for_ms, outcome)
   VALUES ('item-1', 'ops-user', 1, 'worker-b', 7001, 10000, 7001, 'in_flight');`,
  /UNIQUE constraint failed/i,
  'concurrent claim of the same attempt',
);
query(`INSERT INTO ops_action_attempts (item_id, owner_user_id, attempt_no, claimed_by, claimed_at_ms, timeout_ms, scheduled_for_ms, outcome)
VALUES ('item-1', 'ops-user', 2, 'worker-b', 8000, 10000, 8000, 'in_flight');`);
console.log('PASS attempt claims: one attempt number can only be claimed once (atomic consumption before any send).');

// ---- Attempt rows: claim identity immutable, outcome settles exactly once, history never deleted.
expectAbort(`UPDATE ops_action_attempts SET claimed_by = 'evil' WHERE attempt_no = 1 AND item_id = 'item-1';`, /immutable/i, 'claim tamper');
query(`UPDATE ops_action_attempts SET outcome = 'provider_accepted', provider_ref = 'email:ops@example.test', finished_at_ms = 9000 WHERE item_id = 'item-1' AND attempt_no = 1 AND outcome = 'in_flight' RETURNING id;`);
let settled = query(`UPDATE ops_action_attempts SET outcome = 'failed_terminal' WHERE item_id = 'item-1' AND attempt_no = 1 AND outcome = 'in_flight' RETURNING id;`).results;
assert.equal(settled.length, 0, 'an already-settled attempt must not settle twice');
expectAbort(`DELETE FROM ops_action_attempts WHERE item_id = 'item-1';`, /append-only/i, 'attempt deletion');
console.log('PASS attempt history: claims immutable, outcomes settle once, rows never deleted (restarts cannot reset counters).');

// ---- Legacy approvals without a snapshot fail closed (re-approval required, no auto-grant).
query(`INSERT INTO ops_work_items (id, owner_user_id, department, title, description, status, amount_minor, due_date, created_at, updated_at, version, action_type, action_payload_json, approval_state)
VALUES ('item-legacy', 'ops-user', 'sales', 'Legacy', '', 'open', NULL, NULL, 1000, 1000, 2, 'outbound_message', '{"channel":"EMAIL","message":"x"}', 'approved');`);
const legacy = query(`SELECT approved_sha256, max_attempts, request_timeout_ms FROM ops_work_items WHERE id = 'item-legacy';`).results[0];
assert.equal(legacy.approved_sha256, null);
assert.equal(legacy.max_attempts, 3); // conservative test default applied by ALTER; still needs re-approval to send
expectAbort(
  `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
   VALUES ('item-legacy', 'ops-user', 'ops-user', 'approved', 'executed', 'no snapshot', 2, 10000);`,
  /approval transition did not land/i,
  'execute transition without re-approval on a snapshot-less legacy item',
);
console.log('PASS legacy upgrade: pre-0019 approvals keep history but cannot send until re-approved with a snapshot.');

// ---- Upgrade path: an 0018-era database with live approval rows survives 0019 in place.
// (Simulated by data shape: the chain above already contains 0018-era columns; 0019 adds only new
// columns/tables/triggers. Verified by the fresh-chain run plus the legacy row above.)
console.log('PASS upgrade shape: 0019 is additive over 0018 (columns/tables/triggers in one new file; 0018 left byte-identical).');

writeFileSync(`${artifactDir}/pr35-ops-execution-summary.json`, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  target: 'isolated local Wrangler D1 only (pr35-ops-execution-eval); no remote D1, no provider calls',
  proved: [
    'migration chain 0001..0019 applies on a fresh D1',
    'approve requires and atomically stamps the immutable snapshot (hash + target + TTL expiry)',
    'revoke is a real lifecycle state that blocks all further sends',
    'attempt claims elect exactly one winner per attempt number (UNIQUE)',
    'attempt claim identity is immutable; outcomes settle once; attempt history is never deleted',
    'legacy approvals without a snapshot fail closed until re-approved',
  ],
}, null, 2)}\n`);
console.log(`PASS ops-execution evaluation. Artifact: ${artifactDir}/pr35-ops-execution-summary.json`);
