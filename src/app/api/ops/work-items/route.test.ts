import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

const { requireOperationsUser } = vi.hoisted(() => ({ requireOperationsUser: vi.fn() }));
vi.mock('./auth', () => ({ requireOperationsUser }));
import { GET, POST } from './route';
import { GET as GET_EVENTS, PATCH } from './[id]/route';

function makeDb(options: { rows?: unknown[]; item?: unknown; changes?: number } = {}) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const record = { sql, values: [] as unknown[] };
      statements.push(record);
      const stmt = {
        bind(...values: unknown[]) { record.values = values; return stmt; },
        all: vi.fn().mockResolvedValue({ results: options.rows ?? [] }),
        first: vi.fn().mockImplementation(() => sql.startsWith('UPDATE')
          ? options.changes === 0 ? null : { status: 'done', updated_at: 100, version: 2 }
          : options.item ?? null),
        run: vi.fn().mockResolvedValue({ meta: { changes: options.changes ?? 1 } }),
      };
      return stmt as unknown as D1PreparedStatement;
    },
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]),
    exec: vi.fn(), dump: vi.fn(),
  } as unknown as D1Database;
  return { db, statements };
}

function authorize(db: D1Database | null, userId = 'user-a') {
  requireOperationsUser.mockResolvedValue(db
    ? { db, userId }
    : { response: new Response(JSON.stringify({ ok: false }), { status: 503 }) });
}

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('operations work item API', () => {
  beforeEach(() => requireOperationsUser.mockReset());

  it('fails closed when auth cannot provide a D1-backed identity', async () => {
    authorize(null);
    expect((await GET(request('GET', '/api/ops/work-items'))).status).toBe(503);
  });

  it('validates JSON, enum values, calendar dates, amounts and strict owner input', async () => {
    const { db } = makeDb();
    authorize(db);
    expect((await POST(request('POST', '/api/ops/work-items', '{'))).status).toBe(400);
    expect((await POST(request('POST', '/api/ops/work-items', { department: 'random', title: 'x' }))).status).toBe(400);
    expect((await POST(request('POST', '/api/ops/work-items', { department: 'finance', title: 'Bad date', dueDate: '2026-02-30' }))).status).toBe(400);
    expect((await POST(request('POST', '/api/ops/work-items', '{"department":"finance","title":"NaN","amountMinor":NaN}'))).status).toBe(400);
    expect((await POST(request('POST', '/api/ops/work-items', { department: 'finance', title: 'Too big', amountMinor: 10_000_000_001 }))).status).toBe(400);
    expect((await POST(request('POST', '/api/ops/work-items', { department: 'finance', title: 'Owner spoof', owner_user_id: 'user-b' }))).status).toBe(400);
  });

  it('persists a trimmed work item and creation event atomically without trusting request owner fields', async () => {
    const { db, statements } = makeDb();
    authorize(db);
    const response = await POST(request('POST', '/api/ops/work-items', {
      department: 'finance', title: '  Invoice review  ', description: '  Verify source  ', amountMinor: 12345,
    }, { 'x-user-id': 'forged-user' }));
    expect(response.status).toBe(201);
    const body = await response.json() as { ok: boolean; item: { title: string; description: string; status: string; amountMinor: number; version: number } };
    expect(body).toMatchObject({ ok: true, item: { title: 'Invoice review', description: 'Verify source', status: 'open', amountMinor: 12345, version: 0 } });
    expect(db.batch).toHaveBeenCalledOnce();
    expect(statements[0].values).toContain('user-a');
    expect(statements[0].sql).toContain('owner_user_id');
    expect(statements[1].sql).toContain('ops_work_item_events');
    expect(statements[1].sql).toContain('created_at, item_version');
    expect(statements[1].sql).toContain("'open', ?, 0)");
  });

  it('scopes list, filters status and overdue items, and rejects invalid filters', async () => {
    const { db, statements } = makeDb();
    authorize(db);
    const res = await GET(request('GET', '/api/ops/work-items?department=sales&status=open&overdue=true'));
    expect(res.status).toBe(200);
    expect(statements[0].sql).toContain('owner_user_id = ? AND department = ? AND status = ?');
    expect(statements[0].sql).toContain("due_date < ? AND status NOT IN ('done', 'cancelled')");
    expect(statements[0].values.slice(0, 3)).toEqual(['user-a', 'sales', 'open']);
    expect((await GET(request('GET', '/api/ops/work-items?department=finance%2F..'))).status).toBe(400);
    expect((await GET(request('GET', '/api/ops/work-items?overdue=yes'))).status).toBe(400);
  });

  it('serializes only client-safe fields and supports empty results', async () => {
    const { db } = makeDb({ rows: [{ id: 'id1', owner_user_id: 'user-a', department: 'support', title: 'Ticket', description: '', status: 'open', amount_minor: null, due_date: null, created_at: 1, updated_at: 1, version: 0 }] });
    authorize(db);
    const response = await GET(request('GET', '/api/ops/work-items'));
    const body = await response.json() as { items: Array<Record<string, unknown>> };
    expect(body.items[0]).toMatchObject({ id: 'id1', department: 'support', version: 0 });
    expect(body.items[0]).not.toHaveProperty('owner_user_id');
  });

  it('updates with compare-and-swap and relies on the database trigger for atomic history', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const record = { sql, values: [] as unknown[] };
        statements.push(record);
        const stmt = {
          bind(...values: unknown[]) { record.values = values; return stmt; },
          first: vi.fn().mockImplementation(() => sql.startsWith('UPDATE')
            ? { status: 'in_progress', updated_at: 100, version: 4 }
            : { status: 'open', version: 3 }),
        };
        return stmt;
      },
    } as unknown as D1Database;
    authorize(db);
    const response = await PATCH(request('PATCH', '/api/ops/work-items/item_1', { status: 'in_progress' }), { params: Promise.resolve({ id: 'item_1' }) });
    expect(response.status).toBe(200);
    expect(statements[0].values).toEqual(['item_1', 'user-a']);
    expect(statements[1].sql).toContain('version = version + 1');
    expect(statements[1].sql).toContain('owner_user_id = ? AND status = ? AND version = ?');
    expect(statements[1].values).toEqual(['in_progress', expect.any(Number), 'item_1', 'user-a', 'open', 3]);
  });

  it('returns conflict for invalid transition and concurrent stale update', async () => {
    const { db: invalidDb } = makeDb({ item: { status: 'in_progress', version: 1 } });
    authorize(invalidDb);
    expect((await PATCH(request('PATCH', '/api/ops/work-items/item1', { status: 'open' }), { params: Promise.resolve({ id: 'item1' }) })).status).toBe(409);
    const { db: staleDb } = makeDb({ item: { status: 'open', version: 1 }, changes: 0 });
    authorize(staleDb);
    expect((await PATCH(request('PATCH', '/api/ops/work-items/item1', { status: 'done' }), { params: Promise.resolve({ id: 'item1' }) })).status).toBe(409);
  });

  it('returns 404 across owner boundaries and validates IDs and request fields', async () => {
    const { db } = makeDb({ item: null });
    authorize(db, 'user-b');
    expect((await PATCH(request('PATCH', '/api/ops/work-items/x', { status: 'done' }), { params: Promise.resolve({ id: 'x' }) })).status).toBe(404);
    expect((await PATCH(request('PATCH', '/api/ops/work-items/%2F', { status: 'done' }), { params: Promise.resolve({ id: '../secret' }) })).status).toBe(400);
    expect((await PATCH(request('PATCH', '/api/ops/work-items/x', { status: 'unexpected' }), { params: Promise.resolve({ id: 'x' }) })).status).toBe(400);
  });

  it('exposes append-only item history only within owner scope', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const record = { sql, values: [] as unknown[] };
        statements.push(record);
        const stmt = {
          bind(...values: unknown[]) { record.values = values; return stmt; },
          all: vi.fn().mockResolvedValue({ results: [{ id: 'evt', action: 'created', from_status: null, to_status: 'open', created_at: 1, item_version: 0 }] }),
          first: vi.fn().mockResolvedValue({ id: 'item1' }),
        };
        return stmt;
      },
    } as unknown as D1Database;
    authorize(db, 'user-a');
    const response = await GET_EVENTS(request('GET', '/api/ops/work-items/item1'), { params: Promise.resolve({ id: 'item1' }) });
    expect(response.status).toBe(200);
    expect(statements[0].sql).toContain('e.owner_user_id = ? AND w.owner_user_id = ?');
    expect(statements[0].values).toEqual(['item1', 'user-a', 'user-a']);
    expect(statements[1].values).toEqual(['item1', 'user-a']);
    expect((await GET_EVENTS(request('GET', '/api/ops/work-items/item1'), { params: Promise.resolve({ id: 'item1' }) })).status).toBe(200);
  });
});
