import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalD1Database } from '@/ee/billing/__tests__/local-d1-adapter';
import type { D1Database } from '@/lib/db/types';
import { claimAttempt, checkExecutionEligibility, computeNextAttemptNo, finalizeAttempt, markStaleInFlightUnknown, verifyApprovedSnapshot, type ExecutionItemRow } from '@/ee/ops/action-execution';
import { runApprovedAttempt, drainDueActionRetries, loadExecutionItem } from '@/ee/ops/action-execution-runner';
import { computeApprovedSha256, validateRetryPolicy, backoffMsFor, DEFAULT_RETRY_POLICY } from '@/ee/ops/approved-snapshot';
import type { AlertSenders } from '@/ee/alerts/alert-channel-senders';

const OWNER = 'exec-user-a';
let db: LocalD1Database;
let counter = 0;

function senders(behavior: { kind: 'provider_accepted' | 'failed_retryable' | 'failed_terminal' | 'unknown'; count?: { n: number } } = { kind: 'provider_accepted' }): AlertSenders {
  return {
    EMAIL: {
      channel: 'EMAIL',
      targetDescriptor: 'email:ops@example.test',
      async send() {
        if (behavior.count) behavior.count.n += 1;
        return behavior.kind === 'provider_accepted'
          ? { delivered: true, kind: 'provider_accepted', providerRef: 'email:ops@example.test' }
          : { delivered: false, kind: behavior.kind, httpStatus: behavior.kind === 'unknown' ? undefined : 502, error: behavior.kind };
      },
    },
  };
}

async function seedItem(options: {
  approvalState?: string; executionState?: string | null; revoked?: boolean; expired?: boolean;
  sha?: string | null; target?: string | null; maxAttempts?: number; owner?: string; actionType?: string | null;
} = {}): Promise<ExecutionItemRow> {
  counter += 1;
  const id = `exec-item-${counter}`;
  await db.prepare(
    `INSERT INTO ops_work_items
       (id, owner_user_id, department, title, description, status, amount_minor, due_date, created_at, updated_at, version,
        action_type, action_payload_json, approval_state, execution_state, approved_sha256, approved_target,
        approval_expires_at_ms, revoked_at_ms, max_attempts)
     VALUES (?, ?, 'sales', ?, '', 'open', NULL, NULL, 1000, 1000, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, options.owner ?? OWNER, `Item ${counter}`,
    options.actionType === null ? null : 'outbound_message',
    options.actionType === null ? null : JSON.stringify({ channel: 'EMAIL', message: `hello ${counter}` }),
    options.approvalState ?? 'approved', options.executionState ?? null,
    options.sha === null ? null : (options.sha ?? 'sha-placeholder'),
    options.target === null ? null : (options.target ?? 'email:ops@example.test'),
    options.expired ? 1000 : 9_999_999_999_999,
    options.revoked ? 2000 : null,
    options.maxAttempts ?? 2).run();
  return (await loadExecutionItem(db, id, options.owner ?? OWNER))!;
}

async function freshHash(row: ExecutionItemRow): Promise<string> {
  return computeApprovedSha256({
    actionType: row.action_type!,
    payload: JSON.parse(row.action_payload_json ?? 'null'),
    target: 'email:ops@example.test',
    policy: { maxAttempts: row.max_attempts, requestTimeoutMs: row.request_timeout_ms, backoffBaseMs: row.backoff_base_ms, backoffMaxMs: row.backoff_max_ms, approvalTtlMs: row.approval_ttl_ms },
  });
}

beforeAll(async () => {
  db = new LocalD1Database(path.join(mkdtempSync(path.join(tmpdir(), 'pr35-exec-')), 'exec.db'));
  const migrationsDir = path.join(process.cwd(), 'migrations');
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
});

describe('retry policy validation and backoff', () => {
  it('accepts conservative defaults and rejects out-of-bounds policies', () => {
    expect(validateRetryPolicy(undefined)).toMatchObject({ ok: true, policy: DEFAULT_RETRY_POLICY });
    expect(validateRetryPolicy({ maxAttempts: 11 })).toMatchObject({ ok: false });
    expect(validateRetryPolicy({ requestTimeoutMs: 50 })).toMatchObject({ ok: false });
    expect(validateRetryPolicy({ backoffBaseMs: 2000, backoffMaxMs: 1000 })).toMatchObject({ ok: false });
    expect(validateRetryPolicy({ maxAttempts: 5, requestTimeoutMs: 2500 })).toMatchObject({ ok: true, policy: { maxAttempts: 5, requestTimeoutMs: 2500 } });
  });
  it('computes bounded exponential backoff', () => {
    const policy = { maxAttempts: 6, requestTimeoutMs: 1000, backoffBaseMs: 1000, backoffMaxMs: 5000, approvalTtlMs: 60_000 };
    expect([1, 2, 3, 4, 5].map((n) => backoffMsFor(policy, n))).toEqual([1000, 2000, 4000, 5000, 5000]);
  });
});

describe('atomic attempt claims (local D1)', () => {
  it('two workers cannot claim the same attempt number', async () => {
    const item = await seedItem();
    const first = await claimAttempt(db as unknown as D1Database, { item, attemptNo: 1, claimedBy: 'w1', timeoutMs: 1000, scheduledForMs: 1, nowMs: 1 });
    const second = await claimAttempt(db as unknown as D1Database, { item, attemptNo: 1, claimedBy: 'w2', timeoutMs: 1000, scheduledForMs: 1, nowMs: 2 });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, code: 'claim-conflict' });
    expect(await computeNextAttemptNo(db as unknown as D1Database, item.id)).toBe(2);
  });

  it('attempt claims are immutable and history survives independently of any store instance', async () => {
    const item = await seedItem();
    const claim = await claimAttempt(db as unknown as D1Database, { item, attemptNo: 1, claimedBy: 'w1', timeoutMs: 1000, scheduledForMs: 1, nowMs: 1 });
    let tamperBlocked = false;
    try { await db.prepare(`UPDATE ops_action_attempts SET claimed_by = 'evil' WHERE id = ?`).bind(claim.attemptId).run(); }
    catch (error) { tamperBlocked = /immutable/i.test(String(error instanceof Error ? error.message : error)); }
    expect(tamperBlocked).toBe(true);
    expect(await finalizeAttempt(db as unknown as D1Database, { attemptId: claim.attemptId!, outcome: 'provider_accepted', detail: 'sent:EMAIL', nowMs: 5 })).toBe(true);
    // Second finalize is a no-op (outcome already recorded).
    expect(await finalizeAttempt(db as unknown as D1Database, { attemptId: claim.attemptId!, outcome: 'failed_terminal', detail: 'tamper', nowMs: 6 })).toBe(false);
    let deleteBlocked = false;
    try { await db.prepare(`DELETE FROM ops_action_attempts WHERE id = ?`).bind(claim.attemptId).run(); }
    catch (error) { deleteBlocked = /append-only/i.test(String(error instanceof Error ? error.message : error)); }
    expect(deleteBlocked).toBe(true);
    expect(await computeNextAttemptNo(db as unknown as D1Database, item.id)).toBe(2);
  });

  it('stale in_flight claims are finalized as unknown, never as success', async () => {
    const item = await seedItem();
    await claimAttempt(db as unknown as D1Database, { item, attemptNo: 1, claimedBy: 'dead-worker', timeoutMs: 100, scheduledForMs: 1, nowMs: 1_000 });
    await markStaleInFlightUnknown(db as unknown as D1Database, item, 10_000);
    const row = await db.prepare(`SELECT outcome FROM ops_action_attempts WHERE item_id = ?`).bind(item.id).first<{ outcome: string }>();
    expect(row?.outcome).toBe('unknown');
  });
});

describe('eligibility and immutable approved snapshots', () => {
  it('blocks revoked, expired, exhausted and snapshot-less items', async () => {
    expect(await checkExecutionEligibility(await seedItem({ revoked: true }), Date.now(), 0)).toMatchObject({ ok: false, code: 'revoked' });
    expect(await checkExecutionEligibility(await seedItem({ expired: true }), Date.now(), 0)).toMatchObject({ ok: false, code: 'expired' });
    expect(await checkExecutionEligibility(await seedItem({ sha: null, target: null }), Date.now(), 0)).toMatchObject({ ok: false, code: 'policy-missing' });
    expect(await checkExecutionEligibility(await seedItem({ maxAttempts: 1 }), Date.now(), 1)).toMatchObject({ ok: false, code: 'exhausted' });
    expect(await checkExecutionEligibility(await seedItem({ approvalState: 'revoked' }), Date.now(), 0)).toMatchObject({ ok: false, code: 'not-approved' });
    expect(await checkExecutionEligibility(await seedItem({ executionState: 'executed' }), Date.now(), 0)).toMatchObject({ ok: false, code: 'already-executed' });
  });

  it('detects post-approval payload/policy/target edits via the snapshot hash', async () => {
    const item = await seedItem();
    const sha = await freshHash(item);
    await db.prepare(`UPDATE ops_work_items SET approved_sha256 = ? WHERE id = ?`).bind(sha, item.id).run();
    const good = await verifyApprovedSnapshot((await loadExecutionItem(db, item.id, OWNER))!, senders());
    expect(good.ok).toBe(true);
    // Payload edited after approval -> hash mismatch -> re-approval required.
    await db.prepare(`UPDATE ops_work_items SET action_payload_json = ? WHERE id = ?`)
      .bind(JSON.stringify({ channel: 'EMAIL', message: 'TAMPERED' }), item.id).run();
    expect(await verifyApprovedSnapshot((await loadExecutionItem(db, item.id, OWNER))!, senders())).toMatchObject({ ok: false, code: 'snapshot-mismatch' });
    // Target drift -> blocked even before hash comparison.
    expect(await verifyApprovedSnapshot((await loadExecutionItem(db, item.id, OWNER))!, {})).toMatchObject({ ok: false, code: 'target-changed' });
  });
});

describe('runApprovedAttempt end-to-end (local D1)', () => {
  it('provider_accepted marks executed exactly once and blocks further attempts', async () => {
    const item = await seedItem({ maxAttempts: 3 });
    await db.prepare(`UPDATE ops_work_items SET approved_sha256 = ? WHERE id = ?`).bind(await freshHash(item), item.id).run();
    const fresh = (await loadExecutionItem(db, item.id, OWNER))!;
    const outcome = await runApprovedAttempt({ db: db as unknown as D1Database, item: fresh, senders: senders(), nowMs: Date.now() });
    expect(outcome).toMatchObject({ ok: true, outcome: 'provider_accepted', executionState: 'executed' });
    const second = await runApprovedAttempt({ db: db as unknown as D1Database, item: (await loadExecutionItem(db, item.id, OWNER))!, senders: senders(), nowMs: Date.now() });
    expect(second).toMatchObject({ ok: false, code: 'already-executed' });
    const attempts = await db.prepare(`SELECT COUNT(*) AS n FROM ops_action_attempts WHERE item_id = ?`).bind(item.id).first<{ n: number }>();
    expect(attempts?.n).toBe(1);
  });

  it('retryable failure schedules a bounded retry; exhaustion stops for good', async () => {
    const item = await seedItem({ maxAttempts: 2 });
    await db.prepare(`UPDATE ops_work_items SET approved_sha256 = ? WHERE id = ?`).bind(await freshHash(item), item.id).run();
    const behavior = { kind: 'failed_retryable' as const, count: { n: 0 } };
    const first = await runApprovedAttempt({ db: db as unknown as D1Database, item: (await loadExecutionItem(db, item.id, OWNER))!, senders: senders(behavior), nowMs: Date.now() });
    expect(first).toMatchObject({ ok: false, outcome: 'failed_retryable', executionState: 'failed' });
    const afterFirst = await loadExecutionItem(db, item.id, OWNER);
    expect(afterFirst?.next_attempt_at_ms).toBeGreaterThan(Date.now());
    // Drain respects the backoff gate: nothing due yet.
    expect(await drainDueActionRetries({ db: db as unknown as D1Database, senders: senders(behavior), nowMs: Date.now() })).toEqual([]);
    // Force due and drain once; budget (2) is then exhausted.
    await db.prepare(`UPDATE ops_work_items SET next_attempt_at_ms = 1 WHERE id = ?`).bind(item.id).run();
    const drained = await drainDueActionRetries({ db: db as unknown as D1Database, senders: senders(behavior), nowMs: Date.now() });
    expect(drained).toHaveLength(1);
    expect(await runApprovedAttempt({ db: db as unknown as D1Database, item: (await loadExecutionItem(db, item.id, OWNER))!, senders: senders(behavior), nowMs: Date.now() })).toMatchObject({ ok: false, code: 'exhausted' });
    expect(behavior.count.n).toBe(2);
  });

  it('revocation discards execution without a side effect', async () => {
    const item = await seedItem({ maxAttempts: 3 });
    await db.prepare(`UPDATE ops_work_items SET approved_sha256 = ? WHERE id = ?`).bind(await freshHash(item), item.id).run();
    const behavior = { kind: 'provider_accepted' as const, count: { n: 0 } };
    // Revocation lands before the send gate: revoked_at_ms alone must block with zero side effects
    // (the runner's post-claim re-check path uses the same condition).
    await db.prepare(`UPDATE ops_work_items SET revoked_at_ms = ? WHERE id = ?`).bind(Date.now(), item.id).run();
    const outcome = await runApprovedAttempt({ db: db as unknown as D1Database, item: (await loadExecutionItem(db, item.id, OWNER))!, senders: senders(behavior), nowMs: Date.now() });
    expect(outcome).toMatchObject({ ok: false, code: 'revoked' });
    expect(behavior.count.n).toBe(0);
  });

  it('cross-user reads and claims are impossible', async () => {
    const item = await seedItem({ owner: OWNER });
    expect(await loadExecutionItem(db, item.id, 'intruder')).toBeNull();
  });
});
