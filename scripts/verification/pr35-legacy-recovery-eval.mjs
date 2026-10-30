import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseCase, verifyCase, applyCase, makeWranglerExec, REJECT } from './pr35-legacy-recovery-tool.mjs';

assert.ok(process.argv.includes('--reset'), 'Pass --reset to recreate only the isolated PR35 recovery-evaluation D1.');
const database = 'pr35-recovery-eval';
const databaseId = '00000000-0000-4000-8000-000000000037';
const configFile = '.wrangler/pr35-recovery.jsonc';
const persist = '.wrangler/verification/pr35-recovery-d1';
const pre16Dir = '.wrangler/verification/migrations-recovery-pre16';
const seedFile = '.wrangler/verification/pr35-recovery-legacy-seed.sql';
const artifactDir = 'docs/verification/artifacts';
const preflightFile = 'docs/verification/pr35-legacy-recovery-preflight.sql';
const casesDir = 'scripts/verification/recovery-cases';

rmSync(persist, { recursive: true, force: true });
rmSync(pre16Dir, { recursive: true, force: true });
mkdirSync(pre16Dir, { recursive: true });
mkdirSync('.wrangler/verification', { recursive: true });
mkdirSync(artifactDir, { recursive: true });

for (const file of readdirSync('migrations').filter((name) => /^00(?:0[1-9]|1[0-5])_.*\.sql$/.test(name))) {
  copyFileSync(`migrations/${file}`, `${pre16Dir}/${file}`);
}
copyFileSync('scripts/verification/pr35-migration-0016-legacy-seed.sql', seedFile);

function config(migrationsDir) {
  writeFileSync(configFile, JSON.stringify({
    name: 'pr35-recovery-eval-local-only',
    compatibility_date: '2026-08-12',
    d1_databases: [{ binding: 'DB', database_name: database, database_id: databaseId, migrations_dir: migrationsDir }],
  }, null, 2));
}
function wrangler(args, { json = false } = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  if (!json) process.stdout.write(result.stdout);
  return json ? JSON.parse(result.stdout) : result.stdout;
}
function applyMigrations(migrationsDir) {
  config(migrationsDir);
  wrangler(['d1', 'migrations', 'apply', database, '--config', configFile, '--local', '--persist-to', persist]);
}
function query(sql) {
  return wrangler(['d1', 'execute', database, '--config', configFile, '--local', '--persist-to', persist, '--command', sql, '--json'], { json: true });
}
function loadCase(name) {
  const parsed = parseCase(readFileSync(`${casesDir}/${name}`, 'utf8'), name);
  assert.equal(parsed.outcome, 'ok', `${name} should parse: ${parsed.detail ?? ''}`);
  return parsed.case;
}
function loadCaseRaw(name) {
  return parseCase(readFileSync(`${casesDir}/${name}`, 'utf8'), name);
}
function entitlement(sql) {
  return query(sql)[0]?.results ?? [];
}

// ---- Build the post-migration state exactly as migration 0016 leaves it (6 non-BASIC rows revoked).
applyMigrations('verification/migrations-recovery-pre16');
wrangler(['d1', 'execute', database, '--config', configFile, '--local', '--persist-to', persist, '--file', seedFile]);
applyMigrations('../migrations');
const exec = makeWranglerExec({ database, configFile, persist });

const baseline = entitlement(`SELECT workspace_id, tier, revoked_at_ms, expires_at_ms, current_payment_id FROM saas_workspace_entitlements ORDER BY workspace_id;`);
assert.equal(baseline.length, 10);
assert.equal(baseline.filter((row) => row.tier !== 'BASIC' && row.revoked_at_ms !== null).length, 6);
assert.equal(baseline.filter((row) => row.tier !== 'BASIC' && row.expires_at_ms === null).length, 6);
const baselineAudit = entitlement('SELECT COUNT(*) AS n FROM saas_entitlement_recovery_audit;')[0].n;
assert.equal(baselineAudit, 0);
console.log('PASS baseline: 0016 fail-closed state intact (6 non-BASIC rows revoked, 0 audit rows).');

// ---- Read-only recovery preflight on synthetic post-migration data.
const preflightSql = readFileSync(preflightFile, 'utf8').split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
const preflight = query(preflightSql);
writeFileSync(`${artifactDir}/pr35-recovery-preflight.json`, `${JSON.stringify(preflight, null, 2)}\n`);
const classes = Object.fromEntries((preflight[0]?.results ?? []).map((row) => [row.workspace_id, row.recovery_review_class]));
assert.deepEqual(classes, {
  'legacy-paid-expired-like': 'candidate-legacy-evidence-needs-manual-term',
  'legacy-paid-failed-payment': 'reject-payment-evidence-not-finished',
  'legacy-paid-finished-proof': 'candidate-legacy-evidence-needs-manual-term',
  'legacy-paid-no-proof': 'reject-no-payment-evidence',
  'legacy-paid-pending-payment': 'reject-payment-evidence-not-finished',
  'legacy-paid-system-owner': 'reject-identity-unverified',
});
console.log('PASS recovery preflight (read-only) classifies all 6 revoked rows exactly as expected.');

// ---- Dry-run/verification writes nothing.
const case1 = loadCase('case-001-full-evidence-restore.json');
const verified1 = verifyCase(exec, case1);
assert.equal(verified1.outcome, 'ok', JSON.stringify(verified1));
assert.equal(verified1.evidence.kind, 'legacy-ipn');
assert.equal(verified1.evidence.amount, 29);
assert.equal(verified1.evidence.paidAtMs, 1760000000000);
assert.equal(entitlement('SELECT COUNT(*) AS n FROM saas_entitlement_recovery_audit;')[0].n, 0);
assert.equal(entitlement(`SELECT revoked_at_ms FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-finished-proof';`)[0].revoked_at_ms, 1760000000000);
console.log('PASS dry-run verification performs no mutation.');

// ---- Rejected cases: every insufficient/wrong-evidence case fails closed with an explicit reason.
const rejects = [
  ['case-002-missing-proof.json', REJECT.evidenceMissing, 'legacy-paid-no-proof'],
  ['case-003-failed-payment.json', REJECT.statusNotFinished, 'legacy-paid-failed-payment'],
  ['case-004-waiting-payment.json', REJECT.statusNotFinished, 'legacy-paid-pending-payment'],
  ['case-006-wrong-amount.json', REJECT.amountMismatch, 'legacy-paid-expired-like'],
  ['case-007-system-owner.json', REJECT.identity, 'legacy-paid-system-owner'],
  ['case-008-orphan-basic.json', REJECT.basic, 'legacy-orphan-basic-negative-test'],
];
const baselineRevokedByWorkspace = Object.fromEntries(baseline.map((row) => [row.workspace_id, row.revoked_at_ms]));
for (const [name, reason, workspace] of rejects) {
  const result = applyCase(exec, loadCase(name));
  assert.equal(result.outcome, 'reject', `${name} must be rejected`);
  assert.equal(result.reason, reason, `${name}: expected ${reason}, got ${result.reason} (${result.detail})`);
  const row = entitlement(`SELECT tier, revoked_at_ms, expires_at_ms, current_payment_id FROM saas_workspace_entitlements WHERE workspace_id='${workspace}';`)[0];
  assert.equal(row.revoked_at_ms, baselineRevokedByWorkspace[workspace], `${name}: row must stay revoked`);
  assert.equal(row.expires_at_ms, null, `${name}: no expiry may be granted`);
  assert.equal(row.current_payment_id, null, `${name}: no payment binding may be granted`);
}
const case5 = loadCaseRaw('case-005-signed-event-missing-term.json');
assert.equal(case5.outcome, 'reject');
assert.equal(case5.reason, REJECT.schema, 'signed legacy event without term/expiry must be rejected as insufficient evidence');
assert.match(case5.detail, /termEndsAtMs/);
assert.equal(entitlement('SELECT COUNT(*) AS n FROM saas_entitlement_recovery_audit;')[0].n, 0);
console.log('PASS rejections: missing/failed/waiting proof, wrong amount, system owner, orphan BASIC and term-less signed events all fail closed; 0 audit rows; rows stay revoked.');

// ---- Full-evidence case restores exactly the original term.
const applied1 = applyCase(exec, case1);
assert.equal(applied1.outcome, 'applied', JSON.stringify(applied1));
const restored = entitlement(`SELECT tier, revoked_at_ms, expires_at_ms, current_payment_id, updated_at_ms FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-finished-proof';`)[0];
assert.equal(restored.revoked_at_ms, null);
assert.equal(restored.expires_at_ms, 1823072000000, 'restored expiry must equal the evidence-declared original term end');
assert.equal(restored.current_payment_id, 'legacy-payment-good');
const audit1 = entitlement(`SELECT * FROM saas_entitlement_recovery_audit WHERE recovery_id='recovery-2026-10-30-001';`)[0];
assert.equal(audit1.actor, 'owner-reviewer:synthetic-ops-lead');
assert.equal(audit1.reason, case1.reason);
assert.equal(audit1.term_basis, case1.termBasis);
assert.deepEqual(JSON.parse(audit1.evidence_refs_json), case1.evidenceRefs);
assert.equal(audit1.verified_payment_status, 'finished');
assert.equal(audit1.verified_amount, 29);
assert.equal(audit1.verified_currency, 'USDT');
assert.equal(audit1.prior_revoked_at_ms, 1760000000000);
assert.equal(audit1.prior_expires_at_ms, null);
assert.equal(audit1.prior_payment_id, null);
assert.equal(audit1.restored_expires_at_ms, 1823072000000);
assert.equal(audit1.restored_payment_id, 'legacy-payment-good');
console.log('PASS restore: full-evidence case restored to the exact original term with complete before/after audit.');

// ---- Duplicate retry grants nothing and never extends the term.
const retry1 = applyCase(exec, case1);
assert.equal(retry1.outcome, 'reject');
assert.equal(retry1.reason, REJECT.alreadyApplied);
const afterRetry = entitlement(`SELECT expires_at_ms, revoked_at_ms FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-finished-proof';`)[0];
assert.equal(afterRetry.expires_at_ms, 1823072000000);
assert.equal(afterRetry.revoked_at_ms, null);
console.log('PASS idempotency: duplicate retry is a no-op (no re-grant, no term extension).');

// ---- Concurrent racers: both verified before either applied; only one wins; no wrong overwrite.
const raceA = loadCase('case-009-race-a.json');
const raceB = loadCase('case-010-race-b.json');
const staleVerifyB = verifyCase(exec, raceB);
assert.equal(staleVerifyB.outcome, 'ok');
const resultA = applyCase(exec, raceA);
assert.equal(resultA.outcome, 'applied', JSON.stringify(resultA));
const resultB = applyCase(exec, raceB, staleVerifyB);
assert.equal(resultB.outcome, 'reject', 'stale concurrent racer must not grant');
assert.equal(resultB.reason, REJECT.casConflict);
const raceRow = entitlement(`SELECT tier, revoked_at_ms, expires_at_ms, current_payment_id FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-expired-like';`)[0];
assert.equal(raceRow.revoked_at_ms, null);
assert.equal(raceRow.expires_at_ms, 1823072000000, "expiry must be racer A verified term, never racer B");
assert.equal(raceRow.current_payment_id, 'legacy-payment-expired-like');
assert.equal(entitlement(`SELECT COUNT(*) AS n FROM saas_entitlement_recovery_audit WHERE workspace_id='legacy-paid-expired-like';`)[0].n, 1);
console.log('PASS concurrency: stale/duplicate concurrent retry cannot double-grant or overwrite (CAS guard).');

// ---- Primary-key backstop: a second INSERT reusing a recorded recovery_id aborts even on a revoked row.
let pkBlocked = false;
try {
  query(`INSERT INTO saas_entitlement_recovery_audit
    (recovery_id, workspace_id, owner_user_id, tier, actor, reason, term_basis, evidence_refs_json,
     verified_payment_status, verified_amount, verified_currency,
     prior_revoked_at_ms, prior_expires_at_ms, prior_payment_id,
     restored_expires_at_ms, restored_payment_id, applied_at_ms)
  VALUES ('recovery-2026-10-30-001', 'legacy-paid-system-owner', 'system', 'MASTER', 'x', 'y', 'z', '[]',
     'finished', 1, 'USD', 1760000000000, NULL, NULL, 1823072000000, 'p', 1);`);
} catch (error) {
  pkBlocked = /UNIQUE constraint failed/i.test(String(error.message));
}
assert.ok(pkBlocked, 'duplicate recovery_id must be rejected by primary key');
console.log('PASS primary-key backstop: a recorded case id can never grant again.');

// ---- Audit is append-only.
for (const mutation of [
  `UPDATE saas_entitlement_recovery_audit SET reason = 'tampered' WHERE recovery_id = 'recovery-2026-10-30-001';`,
  `DELETE FROM saas_entitlement_recovery_audit WHERE recovery_id = 'recovery-2026-10-30-001';`,
]) {
  let blocked = false;
  try { query(mutation); } catch (error) { blocked = /append-only/i.test(String(error.message)); }
  assert.ok(blocked, 'audit mutation must be blocked');
}
console.log('PASS audit immutability: update/delete are blocked by append-only triggers.');

// ---- Audit hygiene: no secrets or raw payment payloads recorded.
const auditRows = entitlement('SELECT * FROM saas_entitlement_recovery_audit ORDER BY recovery_id;');
assert.equal(auditRows.length, 2, 'exactly two successful recoveries are audited');
for (const row of auditRows) {
  const serialized = JSON.stringify(row);
  assert.ok(!/secret|signature|payload|password|passcode|cookie|authorization/i.test(serialized), `audit row ${row.recovery_id} must not contain sensitive fields`);
}
console.log('PASS audit hygiene: audit rows contain references and verified facts only.');

// ---- Data preservation: history, bots, memberships and untouched rows stay exactly as migrated.
const legacyEvents = entitlement('SELECT COUNT(*) AS n FROM saas_nowpayments_ipn_events;')[0].n;
const eventHistory = entitlement('SELECT COUNT(*) AS n FROM saas_nowpayments_ipn_event_history;')[0].n;
const orders = entitlement('SELECT COUNT(*) AS n FROM saas_payment_orders;')[0].n;
const bots = entitlement('SELECT id, user_id, workspace_id FROM bots ORDER BY id;');
assert.equal(legacyEvents, 4);
assert.equal(eventHistory, 0);
assert.equal(orders, 0);
assert.equal(bots.length, 2);
assert.ok(bots.every((bot) => bot.workspace_id === `personal:${bot.user_id}`));
const stillRevoked = entitlement(`SELECT workspace_id FROM saas_workspace_entitlements WHERE tier <> 'BASIC' AND revoked_at_ms IS NOT NULL ORDER BY workspace_id;`).map((row) => row.workspace_id);
assert.deepEqual(stillRevoked, [
  'legacy-paid-failed-payment',
  'legacy-paid-no-proof',
  'legacy-paid-pending-payment',
  'legacy-paid-system-owner',
]);
console.log('PASS preservation: legacy events, bots, memberships and the 4 unverifiable rows are untouched (still revoked, no expiry granted).');

writeFileSync(`${artifactDir}/pr35-recovery-summary.json`, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  target: 'isolated local Wrangler D1 only (pr35-recovery-eval); no remote D1, no provider calls',
  baselineRevokedNonBasic: 6,
  restored: ['recovery-2026-10-30-001 (legacy-paid-finished-proof -> expires 1823072000000)', 'recovery-race-a (legacy-paid-expired-like -> expires 1823072000000)'],
  rejected: rejects.map(([name, reason]) => `${name}: ${reason}`).concat([`case-005-signed-event-missing-term.json: ${REJECT.schema}`, `recovery-race-b (stale concurrent): ${REJECT.casConflict}`]),
  stillRevoked,
  auditRows: auditRows.map((row) => ({ recovery_id: row.recovery_id, workspace_id: row.workspace_id, restored_expires_at_ms: row.restored_expires_at_ms, actor: row.actor })),
}, null, 2)}\n`);
console.log(`PASS recovery evaluation. Artifacts: ${artifactDir}/pr35-recovery-{preflight,summary}.json`);
