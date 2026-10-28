import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ createServerClient }));
import { GET, POST } from './route';
import { PATCH } from './[id]/route';

function makeDb(overrides: Partial<D1Database> = {}) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const record = { sql, values: [] as unknown[] };
      statements.push(record);
      const stmt = {
        bind(...values: unknown[]) { record.values = values; return stmt; },
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      };
      return stmt as unknown as D1PreparedStatement;
    },
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]),
    exec: vi.fn(), dump: vi.fn(),
    ...overrides,
  } as unknown as D1Database;
  return { db, statements };
}

function request(body?: unknown, headers: Record<string, string> = { 'x-user-id': 'user-123' }) {
  return new Request('https://example.test/api/ops/work-items', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('operations work item API', () => {
  beforeEach(() => createServerClient.mockReset());

  it('requires verified user context and fails closed when D1 is absent', async () => {
    const unauthenticated = await GET(request(undefined, {}));
    expect(unauthenticated.status).toBe(401);
    createServerClient.mockReturnValue(null);
    expect((await GET(request())).status).toBe(503);
  });

  it('validates creation input and persists the row and audit event in one D1 batch', async () => {
    const { db, statements } = makeDb();
    createServerClient.mockReturnValue(db);
    expect((await POST(request({ department: 'random', title: 'x' }))).status).toBe(400);
    expect((await POST(request({ department: 'finance', title: 'Bad date', dueDate: '2026-99-99' }))).status).toBe(400);
    const response = await POST(request({ department: 'finance', title: 'Invoice review', amountMinor: 12345 }));
    expect(response.status).toBe(201);
    const body = await response.json() as { ok: boolean; item: { status: string; amountMinor: number } };
    expect(body.ok).toBe(true);
    expect(body.item.status).toBe('open');
    expect(body.item.amountMinor).toBe(12345);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(statements[0].sql).toContain('owner_user_id');
    expect(statements[0].values).toContain('user-123');
    expect(statements[1].sql).toContain('ops_work_item_events');
  });

  it('uses owner-scoped reads and optional department filtering', async () => {
    const { db, statements } = makeDb();
    createServerClient.mockReturnValue(db);
    const response = await GET(new Request('https://example.test/api/ops/work-items?department=sales', { headers: { 'x-user-id': 'user-a' } }));
    expect(response.status).toBe(200);
    expect(statements[0].sql).toContain('owner_user_id = ? AND department = ?');
    expect(statements[0].values).toEqual(['user-a', 'sales']);
  });

  it('records status transition and audit together, scoped by owner and prior state', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const record = { sql, values: [] as unknown[] };
        statements.push(record);
        const stmt = {
          bind(...values: unknown[]) { record.values = values; return stmt; },
          first: vi.fn().mockResolvedValue({ status: 'open' }),
        };
        return stmt;
      },
      batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]),
    } as unknown as D1Database;
    createServerClient.mockReturnValue(db);
    const response = await PATCH(new Request('https://example.test/api/ops/work-items/item-1', {
      method: 'PATCH', headers: { 'x-user-id': 'owner-1', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'done' }),
    }), { params: Promise.resolve({ id: 'item-1' }) });
    expect(response.status).toBe(200);
    expect(db.batch).toHaveBeenCalledOnce();
    expect(statements[0].sql).toContain('id = ? AND owner_user_id = ?');
    expect(statements[0].values).toContain('owner-1');
    expect(statements[1].sql).toContain('owner_user_id = ? AND status = ?');
    expect(statements[2].sql).toContain('ops_work_item_events');
  });
});
