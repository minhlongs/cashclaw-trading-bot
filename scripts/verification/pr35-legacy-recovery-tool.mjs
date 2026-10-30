#!/usr/bin/env node
// PR35 legacy entitlement recovery tool — case-by-case, evidence-bound, audited restoration.
//
// Owner policy (2026-10-30): entitlements lacking proof stay revoked (fail closed); missing proof is
// never treated as proof of non-payment; restoration is manual, per case, and requires verified
// identity/membership, payment-order-workspace binding, payment status, amount/currency, tier and
// entitlement term. A signed legacy event alone is insufficient. Restores must carry actor, reason,
// evidence references and durable audit — and never secrets or raw payment payloads.
//
// This tool is a LOCAL CLI (wrangler d1). It creates no HTTP endpoint and no generic entitlement
// bypass. It never calls providers. Dry-run is the default; mutation requires --apply. Production
// use is an owner-run operation outside this session and additionally gated by
// PR35_RECOVERY_ALLOW_REMOTE=1 (never set here).
//
// Atomicity/idempotency are enforced by migration 0017 triggers: the audit INSERT and the
// entitlement restore are one SQLite statement, guarded by a compare-and-swap on the verified prior
// state and by the recovery_id primary key. A duplicate retry or a stale/concurrent apply aborts
// without granting anything.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REJECT = {
  schema: 'case-schema-invalid',
  entitlementMissing: 'entitlement-not-found',
  tierMismatch: 'evidence-tier-mismatch',
  basic: 'basic-out-of-scope',
  identity: 'identity-unverified',
  workspace: 'workspace-unverified',
  membership: 'membership-unverified',
  evidenceMissing: 'payment-evidence-missing',
  statusNotFinished: 'payment-status-not-finished',
  signatureUnverified: 'payment-signature-unverified',
  amountMismatch: 'evidence-amount-mismatch',
  currencyMismatch: 'evidence-currency-mismatch',
  bindingMismatch: 'evidence-binding-mismatch',
  termInvalid: 'term-missing-or-invalid',
  refsInvalid: 'evidence-refs-invalid',
  notRevoked: 'entitlement-not-revoked',
  alreadyApplied: 'already-applied',
  casConflict: 'cas-conflict',
};

const SENSITIVE_REF = /secret|signature|payload|password|passcode|cookie|token|authorization/i;
const CASE_ID = /^[A-Za-z0-9._:-]{3,80}$/;

function sqlLit(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    Number.isFinite(value) || (() => { throw new Error(`non-finite number: ${value}`); })();
    return String(value);
  }
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  throw new Error(`unsupported SQL literal type: ${typeof value}`);
}

export function parseCase(rawText, sourceName = 'case') {
  let data;
  try { data = JSON.parse(rawText); } catch (error) {
    return { outcome: 'reject', reason: REJECT.schema, detail: `${sourceName}: invalid JSON (${error.message})` };
  }
  const required = ['caseId', 'actor', 'reason', 'workspaceId', 'ownerUserId', 'tier', 'paymentId',
    'paymentStatus', 'priceAmount', 'priceCurrency', 'termEndsAtMs', 'termBasis', 'evidenceRefs'];
  const missing = required.filter((key) => data?.[key] === undefined || data?.[key] === null);
  if (missing.length) return { outcome: 'reject', reason: REJECT.schema, detail: `${sourceName}: missing ${missing.join(', ')}` };
  if (!CASE_ID.test(data.caseId)) return { outcome: 'reject', reason: REJECT.schema, detail: `${sourceName}: bad caseId` };
  for (const [key, max] of [['actor', 200], ['reason', 1000], ['termBasis', 500]]) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > max) {
      return { outcome: 'reject', reason: REJECT.schema, detail: `${sourceName}: bad ${key}` };
    }
  }
  if (!Array.isArray(data.evidenceRefs) || data.evidenceRefs.length === 0) {
    return { outcome: 'reject', reason: REJECT.refsInvalid, detail: `${sourceName}: evidenceRefs must be a non-empty array` };
  }
  for (const ref of data.evidenceRefs) {
    if (typeof ref !== 'string' || ref.length < 3 || ref.length > 200 || SENSITIVE_REF.test(ref)) {
      return { outcome: 'reject', reason: REJECT.refsInvalid, detail: `${sourceName}: evidence ref must be a non-secret reference string` };
    }
  }
  if (!['PREMIUM', 'ENTERPRISE', 'MASTER'].includes(data.tier)) {
    return { outcome: 'reject', reason: REJECT.schema, detail: `${sourceName}: tier must be a non-BASIC paid tier` };
  }
  if (!Number.isInteger(data.termEndsAtMs) || data.termEndsAtMs <= 0) {
    return { outcome: 'reject', reason: REJECT.termInvalid, detail: `${sourceName}: termEndsAtMs must be a positive integer (the original entitlement term end)` };
  }
  if (typeof data.priceAmount !== 'number' || !(data.priceAmount > 0) || typeof data.priceCurrency !== 'string' || !data.priceCurrency.trim()) {
    return { outcome: 'reject', reason: REJECT.schema, detail: `${sourceName}: bad priceAmount/priceCurrency` };
  }
  return { outcome: 'ok', case: data };
}

function rows(exec, sql) {
  const out = exec(sql);
  return out?.[0]?.results ?? [];
}

// Read-only verification: identity/membership, entitlement state, payment-order-workspace binding,
// payment status, amount/currency, tier, and term. Returns a verified prior-state snapshot or reject.
export function verifyCase(exec, kase) {
  const recorded = rows(exec, `SELECT recovery_id FROM saas_entitlement_recovery_audit WHERE recovery_id = ${sqlLit(kase.caseId)};`);
  if (recorded.length) return { outcome: 'reject', reason: REJECT.alreadyApplied, detail: 'case already recorded in audit; retries never grant again' };
  const entitlements = rows(exec, `
    SELECT workspace_id, owner_user_id, tier, expires_at_ms, revoked_at_ms, current_payment_id, updated_at_ms
    FROM saas_workspace_entitlements
    WHERE workspace_id = ${sqlLit(kase.workspaceId)} AND owner_user_id = ${sqlLit(kase.ownerUserId)};
  `);
  if (entitlements.length !== 1) return { outcome: 'reject', reason: REJECT.entitlementMissing, detail: 'no entitlement row for workspace/owner' };
  const row = entitlements[0];
  if (row.tier === 'BASIC') return { outcome: 'reject', reason: REJECT.basic, detail: 'recovery applies to paid tiers only' };
  if (row.tier !== kase.tier) return { outcome: 'reject', reason: REJECT.tierMismatch, detail: `case tier ${kase.tier} != stored tier ${row.tier}` };

  const users = rows(exec, `SELECT id FROM users WHERE id = ${sqlLit(kase.ownerUserId)};`);
  if (users.length !== 1) return { outcome: 'reject', reason: REJECT.identity, detail: 'owner user row missing; identity not verifiable' };
  const workspaces = rows(exec, `
    SELECT workspace_id FROM saas_workspaces
    WHERE workspace_id = ${sqlLit(kase.workspaceId)} AND owner_user_id = ${sqlLit(kase.ownerUserId)} AND status = 'active';
  `);
  if (workspaces.length !== 1) return { outcome: 'reject', reason: REJECT.workspace, detail: 'active workspace row missing for owner' };
  const memberships = rows(exec, `
    SELECT user_id FROM saas_workspace_memberships
    WHERE workspace_id = ${sqlLit(kase.workspaceId)} AND user_id = ${sqlLit(kase.ownerUserId)}
      AND role = 'OWNER' AND status = 'active' AND (expires_at_ms IS NULL OR expires_at_ms > 0);
  `);
  if (memberships.length !== 1) return { outcome: 'reject', reason: REJECT.membership, detail: 'active OWNER membership missing' };

  const legacyEvents = rows(exec, `
    SELECT payment_id, workspace_id, target_tier, payment_status, pay_amount, pay_currency,
           signature_verified, processed_at_ms
    FROM saas_nowpayments_ipn_events
    WHERE payment_id = ${sqlLit(kase.paymentId)} AND workspace_id = ${sqlLit(kase.workspaceId)};
  `);
  const orderRows = rows(exec, `
    SELECT order_id, workspace_id, owner_user_id, target_tier, price_amount, price_currency,
           status, provider_payment_id, paid_at_ms
    FROM saas_payment_orders
    WHERE (provider_payment_id = ${sqlLit(kase.paymentId)} OR order_id = ${sqlLit(kase.orderId ?? '')})
      AND workspace_id = ${sqlLit(kase.workspaceId)};
  `);
  if (!legacyEvents.length && !orderRows.length) {
    return { outcome: 'reject', reason: REJECT.evidenceMissing, detail: 'no legacy IPN event and no payment order for this payment/workspace' };
  }

  let evidence = null;
  const checks = [];
  for (const event of legacyEvents) {
    if (event.signature_verified !== 1) { checks.push(REJECT.signatureUnverified); continue; }
    if (event.payment_status !== 'finished' && event.payment_status !== 'confirmed') { checks.push(REJECT.statusNotFinished); continue; }
    if (event.target_tier !== kase.tier) { checks.push(REJECT.tierMismatch); continue; }
    if (Math.abs(event.pay_amount - kase.priceAmount) > 1e-6) { checks.push(REJECT.amountMismatch); continue; }
    if (String(event.pay_currency).toUpperCase() !== String(kase.priceCurrency).toUpperCase()) { checks.push(REJECT.currencyMismatch); continue; }
    evidence = { kind: 'legacy-ipn', paymentStatus: event.payment_status, amount: event.pay_amount, currency: event.pay_currency, paidAtMs: event.processed_at_ms };
    break;
  }
  if (!evidence) {
    for (const order of orderRows) {
      if (order.owner_user_id !== kase.ownerUserId) { checks.push(REJECT.bindingMismatch); continue; }
      if (order.target_tier !== kase.tier) { checks.push(REJECT.tierMismatch); continue; }
      if (order.status !== 'finished') { checks.push(REJECT.statusNotFinished); continue; }
      if (Math.abs(order.price_amount - kase.priceAmount) > 1e-6) { checks.push(REJECT.amountMismatch); continue; }
      if (String(order.price_currency).toUpperCase() !== String(kase.priceCurrency).toUpperCase()) { checks.push(REJECT.currencyMismatch); continue; }
      evidence = { kind: 'payment-order', orderId: order.order_id, paymentStatus: order.status, amount: order.price_amount, currency: order.price_currency, paidAtMs: order.paid_at_ms ?? 0 };
      break;
    }
  }
  if (!evidence) {
    const reason = checks[0] ?? REJECT.bindingMismatch;
    return { outcome: 'reject', reason, detail: `no fully matching payment evidence (observed: ${checks.join(', ') || 'none'})` };
  }
  if (!(kase.termEndsAtMs > (evidence.paidAtMs || 0))) {
    return { outcome: 'reject', reason: REJECT.termInvalid, detail: 'termEndsAtMs must be later than the verified payment time (original term end)' };
  }
  if (row.revoked_at_ms === null) return { outcome: 'reject', reason: REJECT.notRevoked, detail: 'entitlement is not in a revoked state; recovery is not applicable' };

  return {
    outcome: 'ok',
    snapshot: {
      priorRevokedAtMs: row.revoked_at_ms,
      priorExpiresAtMs: row.expires_at_ms,
      priorPaymentId: row.current_payment_id,
    },
    evidence,
  };
}

// Apply a verified case as a single audit INSERT; migration 0017 triggers perform the CAS-checked
// restore inside that same statement. Pass a previously captured verifyCase() result to simulate a
// stale concurrent verifier: the guard aborts without granting anything.
export function applyCase(exec, kase, priorVerify = null) {
  const verified = priorVerify ?? verifyCase(exec, kase);
  if (verified.outcome !== 'ok') return verified;
  const prior = verified.snapshot;
  const evidence = verified.evidence;
  const appliedAtMs = Date.now();
  const auditInsert = `
    INSERT INTO saas_entitlement_recovery_audit
      (recovery_id, workspace_id, owner_user_id, tier, actor, reason, term_basis, evidence_refs_json,
       verified_payment_status, verified_amount, verified_currency,
       prior_revoked_at_ms, prior_expires_at_ms, prior_payment_id,
       restored_expires_at_ms, restored_payment_id, applied_at_ms)
    VALUES (
      ${sqlLit(kase.caseId)}, ${sqlLit(kase.workspaceId)}, ${sqlLit(kase.ownerUserId)}, ${sqlLit(kase.tier)},
      ${sqlLit(kase.actor)}, ${sqlLit(kase.reason)}, ${sqlLit(kase.termBasis)},
      ${sqlLit(JSON.stringify(kase.evidenceRefs))},
      ${sqlLit(evidence.paymentStatus)}, ${sqlLit(evidence.amount)}, ${sqlLit(evidence.currency)},
      ${sqlLit(prior.priorRevokedAtMs)}, ${sqlLit(prior.priorExpiresAtMs)}, ${sqlLit(prior.priorPaymentId)},
      ${sqlLit(kase.termEndsAtMs)}, ${sqlLit(kase.paymentId)}, ${sqlLit(appliedAtMs)}
    );
  `;
  try {
    exec(auditInsert);
  } catch (error) {
    const message = String(error.message ?? error);
    if (/UNIQUE constraint failed: .*recovery_id/i.test(message)) return { outcome: 'reject', reason: REJECT.alreadyApplied, detail: 'concurrent duplicate case; nothing granted' };
    if (/recovery CAS conflict/i.test(message)) return { outcome: 'reject', reason: REJECT.casConflict, detail: 'entitlement changed since verification; nothing granted' };
    if (/append-only/i.test(message)) return { outcome: 'reject', reason: REJECT.casConflict, detail: 'audit append-only violation; nothing granted' };
    throw error;
  }
  const after = rows(exec, `
    SELECT tier, expires_at_ms, revoked_at_ms, current_payment_id FROM saas_workspace_entitlements
    WHERE workspace_id = ${sqlLit(kase.workspaceId)} AND owner_user_id = ${sqlLit(kase.ownerUserId)};
  `)[0];
  const auditRow = rows(exec, `SELECT * FROM saas_entitlement_recovery_audit WHERE recovery_id = ${sqlLit(kase.caseId)};`)[0];
  if (!auditRow || after?.revoked_at_ms !== null) {
    return { outcome: 'reject', reason: REJECT.casConflict, detail: 'post-apply consistency check failed; manual review required' };
  }
  return { outcome: 'applied', before: prior, after, auditRow };
}

export function makeWranglerExec({ database, configFile, persist, remote = false }) {
  return (sql) => {
    const args = ['wrangler', 'd1', 'execute', database, '--config', configFile, '--command', sql, '--json'];
    args.push(remote ? '--remote' : '--local');
    if (!remote) args.push('--persist-to', persist);
    const result = spawnSync('npx', args, { encoding: 'utf8' });
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim();
      const error = new Error(detail.slice(-2000) || `wrangler exited ${result.status}`);
      error.wranglerOutput = detail;
      throw error;
    }
    return JSON.parse(result.stdout);
  };
}

function loadCases(path) {
  const stat = statSync(path);
  const files = stat.isDirectory()
    ? readdirSync(path).filter((name) => name.endsWith('.json')).sort().map((name) => `${path}/${name}`)
    : [path];
  return files.map((file) => ({ file, parsed: parseCase(readFileSync(file, 'utf8'), file) }));
}

export function runCli(argv = process.argv.slice(2)) {
  const flag = (name) => argv.includes(name);
  const value = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  const casesPath = value('--cases');
  if (!casesPath) {
    console.error('Usage: node scripts/verification/pr35-legacy-recovery-tool.mjs --cases <file-or-dir> [--apply] [--db name] [--config wrangler.jsonc] [--persist-to dir] [--remote]');
    return 1;
  }
  const remote = flag('--remote');
  if (remote && process.env.PR35_RECOVERY_ALLOW_REMOTE !== '1') {
    console.error('REFUSED: --remote requires PR35_RECOVERY_ALLOW_REMOTE=1 (owner-run production session; never enabled in verification).');
    return 1;
  }
  const apply = flag('--apply');
  const exec = makeWranglerExec({
    database: value('--db', 'pr35-recovery-eval'),
    configFile: value('--config', '.wrangler/pr35-recovery.jsonc'),
    persist: value('--persist-to', '.wrangler/verification/pr35-recovery-d1'),
    remote,
  });
  let worst = 0;
  for (const { file, parsed } of loadCases(casesPath)) {
    if (parsed.outcome === 'reject') {
      console.log(`CASE ${file} REJECT ${parsed.reason} — ${parsed.detail}`);
      worst = 2;
      continue;
    }
    const kase = parsed.case;
    const verified = verifyCase(exec, kase);
    if (verified.outcome === 'reject') {
      console.log(`CASE ${kase.caseId} REJECT ${verified.reason} — ${verified.detail}`);
      worst = 2;
      continue;
    }
    if (!apply) {
      console.log(`CASE ${kase.caseId} DRY-RUN OK — would restore ${kase.workspaceId} (${kase.tier}) to expires_at_ms=${kase.termEndsAtMs}, payment=${kase.paymentId}; prior revoked_at_ms=${verified.snapshot.priorRevokedAtMs}. No changes written.`);
      continue;
    }
    const applied = applyCase(exec, kase);
    if (applied.outcome === 'applied') {
      console.log(`CASE ${kase.caseId} APPLIED — ${kase.workspaceId} (${kase.tier}) restored to expires_at_ms=${applied.after.expires_at_ms}, payment=${applied.after.current_payment_id}; audit row recorded.`);
    } else if (applied.reason === REJECT.alreadyApplied) {
      console.log(`CASE ${kase.caseId} ALREADY-APPLIED — no changes; retries never grant again.`);
    } else {
      console.log(`CASE ${kase.caseId} REJECT ${applied.reason} — ${applied.detail}`);
      worst = 2;
    }
  }
  return worst;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(runCli());
}
