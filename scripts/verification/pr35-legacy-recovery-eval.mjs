import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseCase, verifyCase, applyCase, makeWranglerExec, runCli, REJECT } from './pr35-legacy-recovery-tool.mjs';

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
function queryFile(path) {
  return wrangler(['d1', 'execute', database, '--config', configFile, '--local', '--persist-to', persist, '--file', path, '--json'], { json: true });
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
function auditCount() {
  return entitlement('SELECT COUNT(*) AS n FROM saas_entitlement_recovery_audit;')[0].n;
}
function negRow() {
  return entitlement(`SELECT tier, revoked_at_ms, expires_at_ms, current_payment_id FROM saas_workspace_entitlements WHERE workspace_id='neg-trigger-workspace';`)[0];
}
function expectReject(result, reason, label) {
  assert.equal(result.outcome, 'reject', `${label} must be rejected: ${JSON.stringify(result)}`);
  assert.equal(result.reason, reason, `${label}: expected ${reason}, got ${result.reason} (${result.detail})`);
}
function caseJson(overrides) {
  return JSON.stringify({
    caseId: 'recovery-2026-10-30-001',
    actor: 'owner-reviewer:synthetic-ops-lead',
    reason: 'Synthetic evaluation: provider invoice reconciled, PREMIUM paid in full for the original 24-month term.',
    workspaceId: 'legacy-paid-finished-proof',
    ownerUserId: 'legacy-owner-good',
    tier: 'PREMIUM',
    paymentId: 'legacy-payment-good',
    paymentStatus: 'finished',
    priceAmount: 29,
    priceCurrency: 'USDT',
    termEndsAtMs: 1823072000000,
    termBasis: 'provider record provider-record-PR-7781: 24-month PREMIUM term ending 2027-10-08',
    evidenceRefs: ['provider-record-PR-7781', 'legacy-ipn-event legacy-payment-good'],
    ...overrides,
  });
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
const baselineAudit = auditCount();
assert.equal(baselineAudit, 0);
console.log('PASS baseline: 0016 fail-closed state intact (6 non-BASIC rows revoked, 0 audit rows).');

// ---- Read-only recovery preflight on synthetic post-migration data (pure 0016 state).
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

// ---- Scaffolding for order-backed and trigger-failure scenarios (synthetic, eval-local only).
query(`
INSERT INTO users (id,email,display_name,locale,created_at,updated_at)
VALUES ('legacy-owner-order','legacy-order@example.test','Legacy order-backed owner','en',1730000000,1730000000);
INSERT INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms)
VALUES ('legacy-paid-order-proof','legacy-owner-order','active',1760000000000);
INSERT INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms)
VALUES ('neg-trigger-workspace','legacy-owner-good','active',1760000000000);
INSERT INTO saas_workspace_memberships (workspace_id,user_id,role,status,expires_at_ms,created_at_ms)
VALUES ('legacy-paid-order-proof','legacy-owner-order','OWNER','active',NULL,1760000000000);
INSERT INTO saas_workspace_memberships (workspace_id,user_id,role,status,expires_at_ms,created_at_ms)
VALUES ('neg-trigger-workspace','legacy-owner-good','OWNER','active',NULL,1760000000000);
INSERT INTO saas_workspace_entitlements
  (workspace_id,owner_user_id,tier,max_running_bots,max_walk_forward_windows,monthly_llm_credits,managed_llm_pool_enabled,updated_at_ms,expires_at_ms,revoked_at_ms,current_payment_id)
VALUES
  ('legacy-paid-order-proof','legacy-owner-order','PREMIUM',5,16,10000,1,1760000000000,NULL,1760000000000,NULL),
  ('neg-trigger-workspace','legacy-owner-good','PREMIUM',5,16,10000,1,1760000000000,NULL,1760000000000,NULL);
INSERT INTO saas_payment_orders
  (order_id,workspace_id,owner_user_id,target_tier,price_amount,price_currency,status,provider_payment_id,created_at_ms,expires_at_ms,paid_at_ms)
VALUES
  ('order-legacy-42','legacy-paid-order-proof','legacy-owner-order','PREMIUM',29,'USDT','finished','legacy-payment-order-1',1759000000000,1759003600000,1760000000000);
INSERT INTO saas_nowpayments_ipn_events
  (payment_id,workspace_id,target_tier,payment_status,pay_amount,pay_currency,signature_verified,processed_at_ms)
VALUES
  ('legacy-payment-neg-trigger','neg-trigger-workspace','PREMIUM','finished',49,'USDT',1,1760000000000);
`);
const historyBaseline = {
  events: entitlement('SELECT * FROM saas_nowpayments_ipn_events ORDER BY payment_id;'),
  eventHistory: entitlement('SELECT * FROM saas_nowpayments_ipn_event_history ORDER BY event_id;'),
  orders: entitlement('SELECT * FROM saas_payment_orders ORDER BY order_id;'),
  bots: entitlement('SELECT * FROM bots ORDER BY id;'),
  memberships: entitlement('SELECT * FROM saas_workspace_memberships ORDER BY workspace_id, user_id;'),
  users: entitlement('SELECT * FROM users ORDER BY id;'),
  workspaces: entitlement('SELECT * FROM saas_workspaces ORDER BY workspace_id;'),
};
assert.equal(historyBaseline.events.length, 5);
assert.equal(historyBaseline.orders.length, 1);
console.log('PASS scaffolding: synthetic order-backed and trigger-scenario fixtures installed; payment-history baseline captured.');

// ---- Case-file level rejections: the case file can never smuggle actor/credential content,
// ---- non-finite/overflow terms, or secret/payload strings into the audit.
const parseRejects = [
  [caseJson({ actor: 'bad;actor' }), REJECT.actor, 'actor with control/SQL punctuation'],
  [caseJson({ actor: 'password=hunter2' }), REJECT.actor, 'actor with credential assignment'],
  [caseJson({ actor: 'ops token reviewer' }), REJECT.sensitive, 'actor carrying a sensitive keyword'],
  [caseJson({ reason: 'restore per Bearer token abc123' }), REJECT.sensitive, 'reason carrying a token'],
  [caseJson({ termBasis: 'raw payload dump attached' }), REJECT.sensitive, 'termBasis carrying payload content'],
  [caseJson({ evidenceRefs: ['the ipn signature raw'] }), REJECT.sensitive, 'evidence ref carrying signature material'],
  [caseJson({ evidenceRefs: [] }), REJECT.refsInvalid, 'empty evidence refs'],
  [caseJson({ termEndsAtMs: 1.5 }), REJECT.termInvalid, 'fractional term'],
  [caseJson({ termEndsAtMs: '1823072000000' }), REJECT.termInvalid, 'string term'],
  [caseJson({ termEndsAtMs: 0 }), REJECT.termInvalid, 'zero term'],
  [caseJson({ termEndsAtMs: -1 }), REJECT.termInvalid, 'negative term'],
  [caseJson({ termEndsAtMs: 2 ** 60 }), REJECT.termInvalid, 'unsafe-integer overflow term'],
  [caseJson({ termEndsAtMs: 1e21 }), REJECT.termInvalid, 'float64 overflow term'],
  [caseJson({ priceAmount: 0 }), REJECT.schema, 'zero amount'],
  [caseJson({ priceAmount: -5 }), REJECT.schema, 'negative amount'],
  [caseJson({ priceAmount: 1e21 }), REJECT.schema, 'overflow amount'],
  [caseJson({ priceAmount: Infinity }), REJECT.schema, 'infinite amount is invalid JSON -> schema'],
  [caseJson({ priceCurrency: 'USDT2' }), REJECT.schema, 'non-alpha currency'],
  [caseJson({ tier: 'BASIC' }), REJECT.schema, 'BASIC tier out of scope'],
  [caseJson({ tier: 'GOLD' }), REJECT.schema, 'unknown tier'],
  [caseJson({ caseId: 'bad id with spaces!' }), REJECT.schema, 'bad case id'],
  [caseJson({ paymentStatus: '' }), REJECT.schema, 'empty payment status'],
];
for (const [raw, reason, label] of parseRejects) {
  const parsed = parseCase(raw, label);
  expectReject(parsed, reason, label);
}
expectReject(parseCase(`{"caseId":"x-nan","termEndsAtMs": NaN, "actor":"a-b-c"}`, 'NaN JSON'), REJECT.schema, 'NaN literal in JSON');
expectReject(parseCase(`{"caseId":"x-inf","termEndsAtMs": Infinity, "actor":"a-b-c"}`, 'Infinity JSON'), REJECT.schema, 'Infinity literal in JSON');
expectReject(parseCase('{invalid', 'broken JSON'), REJECT.schema, 'broken JSON');
console.log(`PASS case-file rejections: ${parseRejects.length + 3} malformed/hostile case inputs rejected at parse (actor hygiene, sensitive content, term overflow/NaN/Infinity, missing fields).`);

// ---- CLI exit-code contract (part 1: before any mutation). 0 = dry-run OK, 1 = usage/gate, 2 = reject.
delete process.env.PR35_RECOVERY_ALLOW_REMOTE;
assert.equal(runCli([]), 1, 'missing --cases must exit 1');
assert.equal(runCli(['--cases', `${casesDir}/case-001-full-evidence-restore.json`, '--remote']), 1, '--remote without PR35_RECOVERY_ALLOW_REMOTE must exit 1');
assert.equal(runCli(['--cases', `${casesDir}/case-001-full-evidence-restore.json`]), 0, 'dry-run of a full-evidence case must exit 0');
assert.equal(runCli(['--cases', `${casesDir}/case-002-missing-proof.json`]), 2, 'a rejected case must exit 2');
console.log('PASS CLI exit-code contract (part 1): usage/gate=1, dry-run OK=0, reject=2; --remote gated.');

// ---- Verification-level rejections (read-only): wrong tier/status/currency/binding and term
// ---- problems all fail closed before anything is written.
const verifyRejects = [
  [caseJson({ caseId: 'neg-tier', tier: 'MASTER' }), REJECT.tierMismatch, 'tier mismatch vs stored row'],
  [caseJson({ caseId: 'neg-ws', workspaceId: 'legacy-paid-no-proof', ownerUserId: 'legacy-owner-none' }), REJECT.evidenceMissing, 'payment/workspace mismatch'],
  [caseJson({ caseId: 'neg-owner', workspaceId: 'legacy-paid-no-proof', ownerUserId: 'legacy-owner-good' }), REJECT.entitlementMissing, 'workspace/owner mismatch'],
  [caseJson({ caseId: 'neg-cur', priceCurrency: 'EUR' }), REJECT.currencyMismatch, 'currency mismatch'],
  [caseJson({ caseId: 'neg-status', paymentStatus: 'confirmed' }), REJECT.statusMismatch, 'declared status differs from recorded evidence'],
  [caseJson({ caseId: 'neg-term-past', termEndsAtMs: 1765000000000 }), REJECT.termElapsed, 'original term already ended'],
  [caseJson({ caseId: 'neg-term-huge', termEndsAtMs: 1970000000000 }), REJECT.termExcess, 'term beyond sanity horizon'],
];
for (const [raw, reason, label] of verifyRejects) {
  const parsed = parseCase(raw, label);
  assert.equal(parsed.outcome, 'ok', `${label} should parse: ${parsed.detail ?? ''}`);
  expectReject(verifyCase(exec, parsed.case), reason, label);
}
expectReject(applyCase(exec, parseCase(caseJson({ caseId: 'neg-applied-past-term' , termEndsAtMs: 1765000000000}), 'x').case), REJECT.termElapsed, 'apply of an elapsed-term case');
assert.equal(auditCount(), 0, 'no rejected case may write an audit row');
console.log('PASS verify rejections: tier/status/currency/binding mismatches, elapsed term and horizon overflow all fail closed with 0 audit rows.');

// ---- Dry-run/verification writes nothing.
const case1 = loadCase('case-001-full-evidence-restore.json');
const verified1 = verifyCase(exec, case1);
assert.equal(verified1.outcome, 'ok', JSON.stringify(verified1));
assert.equal(verified1.evidence.kind, 'legacy-ipn');
assert.equal(verified1.evidence.amount, 29);
assert.equal(verified1.evidence.paidAtMs, 1760000000000);
assert.equal(auditCount(), 0);
assert.equal(entitlement(`SELECT revoked_at_ms FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-finished-proof';`)[0].revoked_at_ms, 1760000000000);
console.log('PASS dry-run verification performs no mutation.');

// ---- Rejected fixture cases: every insufficient/wrong-evidence case fails closed with an explicit reason.
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
assert.equal(auditCount(), 0);
console.log('PASS rejections: missing/failed/waiting proof, wrong amount, system owner, orphan BASIC and term-less signed events all fail closed; 0 audit rows; rows stay revoked.');

// ---- Order-backed evidence: strict provider_payment_id + workspace binding.
const orderCaseRaw = caseJson({
  caseId: 'recovery-2026-10-30-order-01',
  reason: 'Synthetic evaluation: server-created order reconciled, PREMIUM paid in full for the original 24-month term.',
  workspaceId: 'legacy-paid-order-proof',
  ownerUserId: 'legacy-owner-order',
  paymentId: 'legacy-payment-order-1',
  termBasis: 'provider record provider-record-PR-8801: 24-month PREMIUM term ending 2027-10-08',
  evidenceRefs: ['provider-record-PR-8801', 'payment-order order-legacy-42'],
  orderId: 'order-legacy-42',
});
const orderCase = parseCase(orderCaseRaw, 'order case');
assert.equal(orderCase.outcome, 'ok', orderCase.detail ?? '');
const verifiedOrder = verifyCase(exec, orderCase.case);
assert.equal(verifiedOrder.outcome, 'ok', JSON.stringify(verifiedOrder));
assert.equal(verifiedOrder.evidence.kind, 'payment-order');
assert.equal(verifiedOrder.evidence.evidenceOrderId, 'order-legacy-42');
expectReject(verifyCase(exec, parseCase(caseJson({ caseId: 'neg-order-amount', workspaceId: 'legacy-paid-order-proof', ownerUserId: 'legacy-owner-order', paymentId: 'legacy-payment-order-1', priceAmount: 100 }), 'x').case), REJECT.amountMismatch, 'order amount mismatch');
expectReject(verifyCase(exec, parseCase(caseJson({ caseId: 'neg-order-ws', paymentId: 'legacy-payment-order-1' }), 'x').case), REJECT.evidenceMissing, 'order payment id bound to a different workspace');
console.log('PASS order-backed verification: strict payment-order binding; mismatches rejected read-only.');

// ---- Order evidence changed between verify and apply: stale apply must fail closed.
const staleOrder = verifiedOrder;
query(`UPDATE saas_payment_orders SET status = 'refunded' WHERE order_id = 'order-legacy-42';`);
expectReject(applyCase(exec, orderCase.case, staleOrder), REJECT.casConflict, 'order refunded between verify and apply');
assert.equal(auditCount(), 0);
assert.equal(entitlement(`SELECT revoked_at_ms FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-order-proof';`)[0].revoked_at_ms, 1760000000000);
query(`UPDATE saas_payment_orders SET status = 'finished' WHERE order_id = 'order-legacy-42';`);
const appliedOrder = applyCase(exec, orderCase.case);
assert.equal(appliedOrder.outcome, 'applied', JSON.stringify(appliedOrder));
const orderRow = entitlement(`SELECT tier, revoked_at_ms, expires_at_ms, current_payment_id FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-order-proof';`)[0];
assert.equal(orderRow.revoked_at_ms, null);
assert.equal(orderRow.expires_at_ms, 1823072000000);
assert.equal(orderRow.current_payment_id, 'legacy-payment-order-1');
const orderAudit = entitlement(`SELECT * FROM saas_entitlement_recovery_audit WHERE recovery_id='recovery-2026-10-30-order-01';`)[0];
assert.equal(orderAudit.evidence_kind, 'payment-order');
assert.equal(orderAudit.evidence_order_id, 'order-legacy-42');
assert.equal(orderAudit.verified_payment_status, 'finished');
console.log('PASS order-backed restore: refunded-between-verify-and-apply is refused (cas-conflict, no audit); clean apply records evidence_kind/evidence_order_id.');

// ---- Trigger-mutation failure: audit row and entitlement restore roll back together.
const negCaseRaw = caseJson({
  caseId: 'recovery-neg-trigger-rollback',
  reason: 'Synthetic evaluation: trigger-failure rollback scenario with fully verified evidence.',
  workspaceId: 'neg-trigger-workspace',
  ownerUserId: 'legacy-owner-good',
  paymentId: 'legacy-payment-neg-trigger',
  priceAmount: 49,
  termBasis: 'provider record provider-record-PR-8811: 24-month PREMIUM term ending 2027-10-08',
  evidenceRefs: ['provider-record-PR-8811', 'legacy-ipn-event legacy-payment-neg-trigger'],
});
const negCaseParsed = parseCase(negCaseRaw, 'neg trigger case');
assert.equal(negCaseParsed.outcome, 'ok', negCaseParsed.detail ?? '');
const negCase = negCaseParsed.case;

// Stale-verify CAS: entitlement row mutated between verify and apply.
const staleNeg = verifyCase(exec, negCase);
assert.equal(staleNeg.outcome, 'ok', JSON.stringify(staleNeg));
query(`UPDATE saas_workspace_entitlements SET expires_at_ms = 12345 WHERE workspace_id='neg-trigger-workspace';`);
expectReject(applyCase(exec, negCase, staleNeg), REJECT.casConflict, 'entitlement expiry changed between verify and apply');
query(`UPDATE saas_workspace_entitlements SET expires_at_ms = NULL WHERE workspace_id='neg-trigger-workspace';`);
const staleNeg2 = verifyCase(exec, negCase);
query(`UPDATE saas_workspace_entitlements SET tier = 'MASTER' WHERE workspace_id='neg-trigger-workspace';`);
expectReject(applyCase(exec, negCase, staleNeg2), REJECT.casConflict, 'entitlement tier changed between verify and apply');
query(`UPDATE saas_workspace_entitlements SET tier = 'PREMIUM' WHERE workspace_id='neg-trigger-workspace';`);
const staleNeg3 = verifyCase(exec, negCase);
query(`UPDATE saas_workspace_memberships SET status = 'revoked' WHERE workspace_id='neg-trigger-workspace' AND user_id='legacy-owner-good';`);
expectReject(applyCase(exec, negCase, staleNeg3), REJECT.casConflict, 'OWNER membership revoked between verify and apply');
query(`UPDATE saas_workspace_memberships SET status = 'active' WHERE workspace_id='neg-trigger-workspace' AND user_id='legacy-owner-good';`);
const staleNeg4 = verifyCase(exec, negCase);
query(`UPDATE saas_workspaces SET owner_user_id = 'legacy-user-a' WHERE workspace_id='neg-trigger-workspace';`);
expectReject(applyCase(exec, negCase, staleNeg4), REJECT.casConflict, 'workspace owner changed between verify and apply');
query(`UPDATE saas_workspaces SET owner_user_id = 'legacy-owner-good' WHERE workspace_id='neg-trigger-workspace';`);
const staleNeg5 = verifyCase(exec, negCase);
query(`UPDATE saas_nowpayments_ipn_events SET pay_amount = 50 WHERE payment_id='legacy-payment-neg-trigger';`);
expectReject(applyCase(exec, negCase, staleNeg5), REJECT.casConflict, 'evidence amount changed between verify and apply');
query(`UPDATE saas_nowpayments_ipn_events SET pay_amount = 49 WHERE payment_id='legacy-payment-neg-trigger';`);
const staleNeg6 = verifyCase(exec, negCase);
query(`UPDATE saas_nowpayments_ipn_events SET signature_verified = 0 WHERE payment_id='legacy-payment-neg-trigger';`);
expectReject(applyCase(exec, negCase, staleNeg6), REJECT.casConflict, 'evidence signature flag changed between verify and apply');
query(`UPDATE saas_nowpayments_ipn_events SET signature_verified = 1 WHERE payment_id='legacy-payment-neg-trigger';`);
assert.equal(auditCount(), 1, 'only the order-backed recovery is audited so far');
const negAfterStale = negRow();
assert.equal(negAfterStale.revoked_at_ms, 1760000000000);
assert.equal(negAfterStale.expires_at_ms, null);
assert.equal(negAfterStale.current_payment_id, null);
console.log('PASS stale-verify CAS: membership/owner/tier/expiry/payment-evidence changes between verify and apply all abort with cas-conflict; nothing granted.');

// ---- Elapsed-term guard enforced by the DB trigger itself (stale verify cannot bypass it).
let termGuardBlocked = false;
try {
  query(`INSERT INTO saas_entitlement_recovery_audit
    (recovery_id, workspace_id, owner_user_id, tier, actor, reason, term_basis, evidence_refs_json,
     evidence_kind, evidence_order_id,
     verified_payment_status, verified_amount, verified_currency,
     prior_revoked_at_ms, prior_expires_at_ms, prior_payment_id,
     restored_expires_at_ms, restored_payment_id, applied_at_ms)
  VALUES ('recovery-neg-term-guard', 'legacy-paid-finished-proof', 'legacy-owner-good', 'PREMIUM',
     'owner-reviewer:synthetic-ops-lead', 'stale attempt', 'attested term', '["ref-a"]',
     'legacy-ipn', NULL, 'finished', 29, 'USDT', 1760000000000, NULL, NULL,
     1823072000000, 'legacy-payment-good', 4000000000000);`);
} catch (error) {
  termGuardBlocked = /recovery restore term already ended/i.test(String(error.message));
}
assert.ok(termGuardBlocked, 'the DB guard must refuse a restore whose term already ended at apply time');
assert.equal(entitlement(`SELECT revoked_at_ms FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-finished-proof';`)[0].revoked_at_ms, 1760000000000);
console.log('PASS DB term guard: an expired entitlement cannot be turned active even with a stale snapshot (restored_expires_at_ms > applied_at_ms enforced in SQL).');

// ---- Simulated storage failure inside the restore trigger: whole statement rolls back.
writeFileSync('.wrangler/verification/pr35-neg-sabotage-trigger.sql', `
CREATE TRIGGER IF NOT EXISTS neg_sabotage_update
BEFORE UPDATE ON saas_workspace_entitlements
WHEN OLD.workspace_id = 'neg-trigger-workspace'
BEGIN
  SELECT RAISE(ABORT, 'simulated storage failure');
END;
`);
queryFile('.wrangler/verification/pr35-neg-sabotage-trigger.sql');
let sabotageError = null;
try { applyCase(exec, negCase); } catch (error) { sabotageError = error; }
assert.ok(sabotageError && /simulated storage failure/.test(String(sabotageError.message ?? sabotageError)), 'the simulated storage failure must surface as an error');
assert.equal(auditCount(), 1, 'a failed restore must not leave an audit row behind');
const negAfterSabotage = negRow();
assert.equal(negAfterSabotage.revoked_at_ms, 1760000000000, 'entitlement must be rolled back with the audit insert');
assert.equal(negAfterSabotage.expires_at_ms, null);
query(`DROP TRIGGER neg_sabotage_update;`);
console.log('PASS atomic rollback: trigger mutation failure rolls back the audit row and the entitlement together.');

// ---- No-op restore / post-state guard: audit row cannot exist unless the restore landed exactly
// ---- one row. Replace the restore trigger with a copy whose UPDATE can match zero rows while the
// ---- post-state check stays live — exactly the "UPDATE not exactly one row" failure mode.
writeFileSync('.wrangler/verification/pr35-neg-noop-restore.sql', `
DROP TRIGGER IF EXISTS saas_entitlement_recovery_apply_restore;
CREATE TRIGGER saas_entitlement_recovery_apply_restore
AFTER INSERT ON saas_entitlement_recovery_audit
BEGIN
  UPDATE saas_workspace_entitlements
  SET revoked_at_ms = NULL,
      expires_at_ms = NEW.restored_expires_at_ms,
      current_payment_id = NEW.restored_payment_id,
      updated_at_ms = NEW.applied_at_ms
  WHERE workspace_id = NEW.workspace_id
    AND owner_user_id = NEW.owner_user_id
    AND tier = NEW.tier
    AND 1 = 0;
  SELECT RAISE(ABORT, 'recovery restore failed: post-state not reached')
  WHERE (SELECT COUNT(*) FROM saas_workspace_entitlements e
         WHERE e.workspace_id = NEW.workspace_id
           AND e.owner_user_id = NEW.owner_user_id
           AND e.tier = NEW.tier
           AND e.revoked_at_ms IS NULL
           AND e.expires_at_ms IS NEW.restored_expires_at_ms
           AND e.current_payment_id IS NEW.restored_payment_id) <> 1;
END;
`);
queryFile('.wrangler/verification/pr35-neg-noop-restore.sql');
let postStateBlocked = false;
try {
  query(`INSERT INTO saas_entitlement_recovery_audit
    (recovery_id, workspace_id, owner_user_id, tier, actor, reason, term_basis, evidence_refs_json,
     evidence_kind, evidence_order_id,
     verified_payment_status, verified_amount, verified_currency,
     prior_revoked_at_ms, prior_expires_at_ms, prior_payment_id,
     restored_expires_at_ms, restored_payment_id, applied_at_ms)
  VALUES ('recovery-neg-noop-restore', 'neg-trigger-workspace', 'legacy-owner-good', 'PREMIUM',
     'owner-reviewer:synthetic-ops-lead', 'noop restore attempt', 'attested term', '["ref-b"]',
     'legacy-ipn', NULL, 'finished', 49, 'USDT', 1760000000000, NULL, NULL,
     1823072000000, 'legacy-payment-neg-trigger', ${Date.now()});`);
} catch (error) {
  postStateBlocked = /recovery restore failed: post-state not reached/i.test(String(error.message));
}
assert.ok(postStateBlocked, 'a no-op restore must abort the whole statement (no "restored" audit record)');
assert.equal(auditCount(), 1, 'the aborted insert must not survive');
const negAfterNoop = negRow();
assert.equal(negAfterNoop.revoked_at_ms, 1760000000000);
query(`DROP TRIGGER saas_entitlement_recovery_apply_restore;`);
queryFile('migrations/0017_legacy_entitlement_recovery_audit.sql');
const rebuiltTrigger = entitlement(`SELECT sql FROM sqlite_master WHERE type='trigger' AND name='saas_entitlement_recovery_apply_restore';`);
assert.equal(rebuiltTrigger.length, 1, 'the real restore trigger must be rebuilt from migration 0017');
assert.match(rebuiltTrigger[0].sql, /post-state not reached/);
assert.match(rebuiltTrigger[0].sql, /SET revoked_at_ms = NULL/);
assert.doesNotMatch(rebuiltTrigger[0].sql, /AND 1 = 0/, 'the sabotaged trigger must be gone');
console.log('PASS post-state guard: a no-op/wrong UPDATE cannot leave a restored audit record; migration 0017 rebuilds the real trigger.');

// ---- The failed attempts above left no audit residue: the same case now applies cleanly.
const appliedNeg = applyCase(exec, negCase);
assert.equal(appliedNeg.outcome, 'applied', JSON.stringify(appliedNeg));
const negFinal = negRow();
assert.equal(negFinal.revoked_at_ms, null);
assert.equal(negFinal.expires_at_ms, 1823072000000);
assert.equal(negFinal.current_payment_id, 'legacy-payment-neg-trigger');
console.log('PASS recovery after failures: clean apply succeeds afterwards, proving failed attempts were fully rolled back (no PK residue).');

// ---- Duplicate recovery_id semantics: identical payload = idempotent no-op; different payload =
// ---- explicit conflict, never "already-approved".
const case1Variant = parseCase(caseJson({ caseId: 'recovery-2026-10-30-001', termEndsAtMs: 1828084800000 }), 'variant');
assert.equal(case1Variant.outcome, 'ok', case1Variant.detail ?? '');
const vP = verifyCase(exec, case1);
assert.equal(vP.outcome, 'ok', JSON.stringify(vP));
const applied1 = applyCase(exec, case1, vP);
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
assert.equal(audit1.evidence_kind, 'legacy-ipn');
assert.equal(audit1.evidence_order_id, null);
assert.equal(audit1.verified_payment_status, 'finished');
assert.equal(audit1.verified_amount, 29);
assert.equal(audit1.verified_currency, 'USDT');
assert.equal(audit1.prior_revoked_at_ms, 1760000000000);
assert.equal(audit1.prior_expires_at_ms, null);
assert.equal(audit1.prior_payment_id, null);
assert.equal(audit1.restored_expires_at_ms, 1823072000000);
assert.equal(audit1.restored_payment_id, 'legacy-payment-good');
console.log('PASS restore: full-evidence case restored to the exact original term with complete before/after audit.');

// Stale second apply of a different payload with the SAME id against the SAME target: the guard
// sees the restored row first and aborts — still never a grant and never "already-approved".
const staleVariantVerify = {
  outcome: 'ok',
  snapshot: { priorRevokedAtMs: 1760000000000, priorExpiresAtMs: null, priorPaymentId: null },
  evidence: { kind: 'legacy-ipn', evidenceOrderId: null, paymentStatus: 'finished', amount: 29, currency: 'USDT', paidAtMs: 1760000000000 },
};
expectReject(applyCase(exec, case1Variant.case, staleVariantVerify), REJECT.casConflict, 'stale same-target second apply with reused id');
expectReject(verifyCase(exec, case1Variant.case), REJECT.duplicateConflict, 'reused recovery_id with a different payload must conflict, not report already-approved');
// Same id re-pointed at a DIFFERENT, still-untouched target: the guard passes, the primary key
// rejects, and the tool reports an explicit conflict for the different payload.
const dupeIdCase = parseCase(caseJson({
  caseId: 'recovery-2026-10-30-001',
  workspaceId: 'legacy-paid-expired-like',
  ownerUserId: 'legacy-owner-expired',
  tier: 'ENTERPRISE',
  paymentId: 'legacy-payment-expired-like',
  priceAmount: 99,
  termBasis: 'provider record provider-record-PR-7790: legacy term ending 2027-10-08',
  evidenceRefs: ['provider-record-PR-7790', 'legacy-ipn-event legacy-payment-expired-like'],
}), 'dupe id case');
assert.equal(dupeIdCase.outcome, 'ok', dupeIdCase.detail ?? '');
const dupeIdVerify = {
  outcome: 'ok',
  snapshot: { priorRevokedAtMs: 1700000000000, priorExpiresAtMs: null, priorPaymentId: null },
  evidence: { kind: 'legacy-ipn', evidenceOrderId: null, paymentStatus: 'finished', amount: 99, currency: 'USDT', paidAtMs: 1700000000000 },
};
expectReject(applyCase(exec, dupeIdCase.case, dupeIdVerify), REJECT.duplicateConflict, 'same recovery_id raced onto a different target with a different payload');
const retry1 = applyCase(exec, case1);
expectReject(retry1, REJECT.alreadyApplied, 'identical duplicate retry');
const afterRetry = entitlement(`SELECT expires_at_ms, revoked_at_ms FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-finished-proof';`)[0];
assert.equal(afterRetry.expires_at_ms, 1823072000000);
assert.equal(afterRetry.revoked_at_ms, null);
console.log('PASS duplicate semantics: identical retry is already-applied (no re-grant/extension); reused id with different payload is recovery-id-conflict (never accepted).');

// ---- Two different recovery ids targeting the same entitlement: second one cannot land.
const raceA = loadCase('case-009-race-a.json');
const raceB = loadCase('case-010-race-b.json');
const staleVerifyB = verifyCase(exec, raceB);
assert.equal(staleVerifyB.outcome, 'ok');
const resultA = applyCase(exec, raceA);
assert.equal(resultA.outcome, 'applied', JSON.stringify(resultA));
const resultB = applyCase(exec, raceB, staleVerifyB);
assert.equal(resultB.outcome, 'reject', 'stale concurrent racer must not grant');
assert.equal(resultB.reason, REJECT.casConflict);
expectReject(verifyCase(exec, raceB), REJECT.notRevoked, 'a second recovery id for the same entitlement');
const raceRow = entitlement(`SELECT tier, revoked_at_ms, expires_at_ms, current_payment_id FROM saas_workspace_entitlements WHERE workspace_id='legacy-paid-expired-like';`)[0];
assert.equal(raceRow.revoked_at_ms, null);
assert.equal(raceRow.expires_at_ms, 1823072000000, 'expiry must be racer A verified term, never racer B');
assert.equal(raceRow.current_payment_id, 'legacy-payment-expired-like');
assert.equal(entitlement(`SELECT COUNT(*) AS n FROM saas_entitlement_recovery_audit WHERE workspace_id='legacy-paid-expired-like';`)[0].n, 1);
console.log('PASS concurrency: two ids on one entitlement - only the first verified apply lands; stale racer is cas-conflict; fresh second id is not-revoked.');

// ---- Primary-key backstop: a second INSERT reusing a recorded recovery_id aborts even on a revoked row.
query(`UPDATE saas_workspace_entitlements SET revoked_at_ms = 1760000000000 WHERE workspace_id='legacy-paid-finished-proof';`);
let pkBlocked = false;
try {
  query(`INSERT INTO saas_entitlement_recovery_audit
    (recovery_id, workspace_id, owner_user_id, tier, actor, reason, term_basis, evidence_refs_json,
     evidence_kind, evidence_order_id,
     verified_payment_status, verified_amount, verified_currency,
     prior_revoked_at_ms, prior_expires_at_ms, prior_payment_id,
     restored_expires_at_ms, restored_payment_id, applied_at_ms)
  VALUES ('recovery-2026-10-30-001', 'legacy-paid-finished-proof', 'legacy-owner-good', 'PREMIUM',
     'owner-reviewer:synthetic-ops-lead', 'pk backstop', 'attested term', '["ref-c"]',
     'legacy-ipn', NULL, 'finished', 29, 'USDT', 1760000000000, 1823072000000, 'legacy-payment-good',
     1823072000000, 'legacy-payment-good', ${Date.now()});`);
} catch (error) {
  pkBlocked = /UNIQUE constraint failed/i.test(String(error.message));
}
assert.ok(pkBlocked, 'duplicate recovery_id must be rejected by primary key');
// Identical payload racing through the primary key on an eligible row: mapped to already-applied,
// never a re-grant (the same race with a different payload maps to recovery-id-conflict above).
const identicalRaceVerify = {
  outcome: 'ok',
  snapshot: { priorRevokedAtMs: 1760000000000, priorExpiresAtMs: 1823072000000, priorPaymentId: 'legacy-payment-good' },
  evidence: { kind: 'legacy-ipn', evidenceOrderId: null, paymentStatus: 'finished', amount: 29, currency: 'USDT', paidAtMs: 1760000000000 },
};
expectReject(applyCase(exec, case1, identicalRaceVerify), REJECT.alreadyApplied, 'identical-payload race through the primary key');
query(`UPDATE saas_workspace_entitlements SET revoked_at_ms = NULL WHERE workspace_id='legacy-paid-finished-proof';`);
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
assert.equal(auditRows.length, 4, 'exactly four successful recoveries are audited');
for (const row of auditRows) {
  const serialized = JSON.stringify(row);
  assert.ok(!/secret|signature|payload|password|passcode|cookie|authorization/i.test(serialized), `audit row ${row.recovery_id} must not contain sensitive fields`);
  assert.ok(['legacy-ipn', 'payment-order'].includes(row.evidence_kind), 'audit rows must record how the evidence was matched');
}
console.log('PASS audit hygiene: audit rows contain references and verified facts only.');

// ---- Data preservation: payment history, bots, memberships, users and workspaces are byte-identical
// ---- to the pre-recovery baseline; only entitlement rows changed (the recoveries themselves).
const historyFinal = {
  events: entitlement('SELECT * FROM saas_nowpayments_ipn_events ORDER BY payment_id;'),
  eventHistory: entitlement('SELECT * FROM saas_nowpayments_ipn_event_history ORDER BY event_id;'),
  orders: entitlement('SELECT * FROM saas_payment_orders ORDER BY order_id;'),
  bots: entitlement('SELECT * FROM bots ORDER BY id;'),
  memberships: entitlement('SELECT * FROM saas_workspace_memberships ORDER BY workspace_id, user_id;'),
  users: entitlement('SELECT * FROM users ORDER BY id;'),
  workspaces: entitlement('SELECT * FROM saas_workspaces ORDER BY workspace_id;'),
};
assert.deepEqual(historyFinal, historyBaseline, 'recovery must never delete or modify payment history, bots, memberships, users or workspaces');
const stillRevoked = entitlement(`SELECT workspace_id FROM saas_workspace_entitlements WHERE tier <> 'BASIC' AND revoked_at_ms IS NOT NULL ORDER BY workspace_id;`).map((row) => row.workspace_id);
assert.deepEqual(stillRevoked, [
  'legacy-paid-failed-payment',
  'legacy-paid-no-proof',
  'legacy-paid-pending-payment',
  'legacy-paid-system-owner',
]);
console.log('PASS preservation: legacy events, orders, bots, memberships, users and workspaces are byte-identical; the 4 unverifiable rows stay revoked with no expiry granted.');

// ---- CLI exit-code contract (part 2): idempotent retry exits 0; conflicting payload exits 2.
writeFileSync('.wrangler/verification/pr35-cli-conflict-case.json', caseJson({ caseId: 'recovery-2026-10-30-001', termEndsAtMs: 1828084800000 }));
assert.equal(runCli(['--cases', `${casesDir}/case-001-full-evidence-restore.json`]), 0, 'an already-applied identical case must exit 0 (idempotent)');
assert.equal(runCli(['--cases', '.wrangler/verification/pr35-cli-conflict-case.json']), 2, 'a reused recovery_id with a different payload must exit 2');
console.log('PASS CLI exit-code contract (part 2): already-applied=0, conflicting duplicate=2.');

writeFileSync(`${artifactDir}/pr35-recovery-summary.json`, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  target: 'isolated local Wrangler D1 only (pr35-recovery-eval); no remote D1, no provider calls',
  baselineRevokedNonBasic: 6,
  restored: [
    'recovery-2026-10-30-order-01 (legacy-paid-order-proof -> expires 1823072000000, payment-order evidence)',
    'recovery-neg-trigger-rollback (neg-trigger-workspace -> expires 1823072000000, after rolled-back failures)',
    'recovery-2026-10-30-001 (legacy-paid-finished-proof -> expires 1823072000000)',
    'recovery-race-a (legacy-paid-expired-like -> expires 1823072000000)',
  ],
  rejected: rejects.map(([name, reason]) => `${name}: ${reason}`).concat([
    `case-005-signed-event-missing-term.json: ${REJECT.schema}`,
    'case-file parse rejections: actor/sensitive/term-overflow/NaN/Infinity/missing-field (25 inputs)',
    'verify rejections: tier/status/currency/binding mismatch, elapsed term, horizon overflow',
    `recovery-race-b (stale concurrent): ${REJECT.casConflict}`,
    'reused recovery_id with different payload: recovery-id-conflict',
    'stale verify with membership/owner/tier/expiry/evidence mutation: cas-conflict (6 scenarios)',
    'DB term guard (stale applied_at): term-already-ended',
    'simulated storage failure: full rollback, no audit row',
    'no-op restore: post-state guard aborts, no audit row',
  ]),
  stillRevoked,
  auditRows: auditRows.map((row) => ({ recovery_id: row.recovery_id, workspace_id: row.workspace_id, evidence_kind: row.evidence_kind, restored_expires_at_ms: row.restored_expires_at_ms, actor: row.actor })),
}, null, 2)}\n`);
console.log(`PASS recovery evaluation. Artifacts: ${artifactDir}/pr35-recovery-{preflight,summary}.json`);
