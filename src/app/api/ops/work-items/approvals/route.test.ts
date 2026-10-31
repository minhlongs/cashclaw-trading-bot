import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalD1Database } from '@/ee/billing/__tests__/local-d1-adapter';
import type { D1Database } from '@/lib/db/types';

const { requireOperationsUser, senderBehavior } = vi.hoisted(() => ({
  requireOperationsUser: vi.fn(),
  senderBehavior: { deliver: true, error: 'smtp down' },
}));
vi.mock('../auth', () => ({ requireOperationsUser }));
vi.mock('@/ee/alerts/alert-channel-senders', () => ({
  createSendersFromEnv: () => ({
    EMAIL: {
      channel: 'EMAIL',
      send: vi.fn(async () => senderBehavior.deliver
        ? { delivered: true, providerRef: 'email:ops@example.test' }
        : { delivered: false, error: senderBehavior.error }),
    },
  }),
}));

import { POST } from './route';

const USER = 'approval-user-a';
let db: LocalD1Database;
let itemCounter = 0;

async function seedItem(options: {
  approvalState?: string; executionState?: string | null; actionType?: string | null; version?: number;
} = {}): Promise<string> {
  itemCounter += 1;
  const id = `approval-item-${itemCounter}`;
  await db.prepare(
    `INSERT INTO ops_work_items
       (id, owner_user_id, department, title, description, status, amount_minor, due_date, created_at, updated_at, version,
        action_type, action_payload_json, approval_state, execution_state)
     VALUES (?, ?, 'sales', ?, '', 'open', NULL, NULL, 1000, 1000, ?, ?, ?, ?, ?)`,
  ).bind(id, USER, `Item ${itemCounter}`, options.version ?? 0, options.actionType === null ? null : (options.actionType ?? 'outbound_message'),
    options.actionType === null ? null : JSON.stringify({ channel: 'EMAIL', message: `message ${itemCounter}` }),
    options.approvalState ?? 'draft', options.executionState ?? null).run();
  return id;
}

function approvalRequest(body: unknown) {
  return new Request('https://example.test/api/ops/work-items/approvals', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  const response = await POST(approvalRequest(body));
  return { status: response.status, body: await response.json() as { ok: boolean; results: Array<Record<string, unknown>> } };
}

beforeAll(async () => {
  db = new LocalD1Database(path.join(mkdtempSync(path.join(tmpdir(), 'pr35-approval-')), 'approval.db'));
  const migrationsDir = path.join(process.cwd(), 'migrations');
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  requireOperationsUser.mockResolvedValue({ db: db as unknown as D1Database, userId: USER });
});

describe('approvals route (real local D1 with migration 0018 triggers)', () => {
  it('walks submit -> approve -> execute on an outbound_message item with a full audit trail', async () => {
    const id = await seedItem();
    const submitted = await post({ action: 'submit', itemId: id });
    expect(submitted.status).toBe(200);
    expect(submitted.body.results[0]).toMatchObject({ itemId: id, ok: true, state: 'pending_approval', version: 1 });

    const approved = await post({ action: 'approve', itemId: id, reason: 'reviewed' });
    expect(approved.body.results[0]).toMatchObject({ ok: true, state: 'approved', version: 2 });

    const executed = await post({ action: 'execute', itemId: id });
    expect(executed.body.results[0]).toMatchObject({ ok: true, state: 'approved', executionState: 'executed', version: 3 });

    const row = await db.prepare(`SELECT * FROM ops_work_items WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    expect(row).toMatchObject({ approval_state: 'approved', execution_state: 'executed', approved_by: USER, version: 3 });
    expect(row?.decision_reason).toBeNull();

    const audit = await db.prepare(`SELECT * FROM ops_approval_events WHERE item_id = ? ORDER BY id`).bind(id).all<{ from_state: string; to_state: string; item_version: number; actor: string }>();
    expect(audit.results.map((entry) => [entry.from_state, entry.to_state, entry.item_version])).toEqual([
      ['draft', 'pending_approval', 0], ['pending_approval', 'approved', 1], ['approved', 'executed', 2],
    ]);
    expect(audit.results.every((entry) => entry.actor === USER)).toBe(true);
  });

  it('reject requires a reason, lands in rejected with the reason stored', async () => {
    const id = await seedItem();
    await post({ action: 'submit', itemId: id });
    const noReason = await post({ action: 'reject', itemId: id });
    expect(noReason.body.results[0]).toMatchObject({ ok: false, code: 'reason-required' });
    const rejected = await post({ action: 'reject', itemId: id, reason: 'evidence mismatch' });
    expect(rejected.body.results[0]).toMatchObject({ ok: true, state: 'rejected' });
    const row = await db.prepare(`SELECT decision_reason FROM ops_work_items WHERE id = ?`).bind(id).first<{ decision_reason: string }>();
    expect(row?.decision_reason).toBe('evidence mismatch');
  });

  it('blocks plain items and illegal transitions without writing audit rows', async () => {
    const plain = await seedItem({ actionType: null, approvalState: 'none' });
    const blocked = await post({ action: 'submit', itemId: plain });
    expect(blocked.body.results[0]).toMatchObject({ ok: false, code: 'not-actionable' });

    const draft = await seedItem();
    const early = await post({ action: 'execute', itemId: draft });
    expect(early.body.results[0]).toMatchObject({ ok: false, code: 'invalid-state-transition' });

    const auditCount = await db.prepare(`SELECT COUNT(*) AS n FROM ops_approval_events`).first<{ n: number }>();
    expect(auditCount?.n).toBeGreaterThan(0);
    const stray = await db.prepare(`SELECT COUNT(*) AS n FROM ops_approval_events WHERE item_id IN (?, ?)`).bind(plain, draft).first<{ n: number }>();
    expect(stray?.n).toBe(0);
  });

  it('a stale concurrent transition aborts atomically (no audit row, no state change)', async () => {
    const id = await seedItem();
    // Two submits racing: the second sees the row already past 'draft'; the trigger CAS must
    // refuse it and roll the whole INSERT back.
    const first = await post({ action: 'submit', itemId: id });
    expect(first.body.results[0]).toMatchObject({ ok: true, version: 1 });
    // Force a stale snapshot by rewinding the item's version/state representation in a second
    // concurrent request path: simulate by calling the trigger INSERT directly with an old version.
    let aborted = false;
    try {
      await db.prepare(
        `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
         VALUES (?, ?, ?, 'draft', 'pending_approval', NULL, 0, ?)`,
      ).bind(id, USER, USER, Date.now()).run();
    } catch (error) {
      aborted = /approval transition did not land/i.test(String(error instanceof Error ? error.message : error));
    }
    expect(aborted).toBe(true);
    const row = await db.prepare(`SELECT approval_state, version FROM ops_work_items WHERE id = ?`).bind(id).first<{ approval_state: string; version: number }>();
    expect(row).toMatchObject({ approval_state: 'pending_approval', version: 1 });
    const audit = await db.prepare(`SELECT COUNT(*) AS n FROM ops_approval_events WHERE item_id = ?`).bind(id).first<{ n: number }>();
    expect(audit?.n).toBe(1);
  });

  it('approval audit is append-only', async () => {
    const id = await seedItem();
    await post({ action: 'submit', itemId: id });
    for (const sql of [
      `UPDATE ops_approval_events SET reason = 'tampered' WHERE item_id = '${id}'`,
      `DELETE FROM ops_approval_events WHERE item_id = '${id}'`,
    ]) {
      let blocked = false;
      try { await db.prepare(sql).run(); } catch (error) { blocked = /append-only/i.test(String(error instanceof Error ? error.message : error)); }
      expect(blocked).toBe(true);
    }
  });

  it('batch approve processes each item independently and reports per-item outcomes', async () => {
    const a = await seedItem({ approvalState: 'pending_approval', version: 1 });
    const b = await seedItem();
    const missing = 'approval-item-missing';
    const result = await post({ action: 'approve', itemIds: [a, b, missing] });
    expect(result.status).toBe(200);
    expect(result.body.results).toMatchObject([
      { itemId: a, ok: true, state: 'approved' },
      { itemId: b, ok: false, code: 'invalid-state-transition' },
      { itemId: missing, ok: false, code: 'not-found' },
    ]);
  });

  it('failed executions are recorded as failed and retriable; success is terminal', async () => {
    const id = await seedItem({ approvalState: 'approved', version: 2 });
    senderBehavior.deliver = false;
    const failing = await post({ action: 'execute', itemId: id });
    expect(failing.body.results[0]).toMatchObject({ ok: true, executionState: 'failed' });
    const row = await db.prepare(`SELECT execution_state, execution_result, version FROM ops_work_items WHERE id = ?`).bind(id).first<{ execution_state: string; execution_result: string; version: number }>();
    expect(row).toMatchObject({ execution_state: 'failed', version: 3 });
    expect(row?.execution_result).toContain('smtp down');

    senderBehavior.deliver = true;
    const retried = await post({ action: 'execute', itemId: id });
    expect(retried.body.results[0]).toMatchObject({ ok: true, executionState: 'executed', version: 4 });
    const again = await post({ action: 'execute', itemId: id });
    expect(again.body.results[0]).toMatchObject({ ok: false, code: 'invalid-state-transition' });
    senderBehavior.deliver = true;
  });
});
