import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalD1Database } from '@/ee/billing/__tests__/local-d1-adapter';
import { createD1TickLeaseStore, createMemoryTickLeaseStore, duplicateTickGuard, epochMinuteOf } from '../tick-lease-store';

const MINUTE = 60_000;

function input(overrides: Partial<{ botId: string; workspaceId: string; isolateId: string; nowMs: number; leaseDurationMs: number }> = {}) {
  return {
    botId: 'bot-1', workspaceId: 'ws-1', isolateId: 'isolate-a',
    nowMs: 1_700_000_000_000, ...overrides,
  };
}

describe('memory tick lease store', () => {
  it('grants one lease per bot/minute and guards duplicates', async () => {
    const store = createMemoryTickLeaseStore();
    const first = await store.acquireTickLease(input());
    expect(first.ok).toBe(true);
    const duplicate = await store.acquireTickLease(input({ isolateId: 'isolate-b' }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toBe(duplicateTickGuard('bot-1', 'isolate-a', epochMinuteOf(1_700_000_000_000)));
    const nextMinute = await store.acquireTickLease(input({ nowMs: 1_700_000_000_000 + MINUTE }));
    expect(nextMinute.ok).toBe(true);
    expect(await store.activeLeaseCount(1_700_000_000_000 + 1_000)).toBe(1);
    expect(await store.activeLeaseCount(1_700_000_000_000 + 1_000, 'ws-other')).toBe(0);
  });

  it('takes over an expired lease but never a live one', async () => {
    const store = createMemoryTickLeaseStore();
    await store.acquireTickLease(input({ leaseDurationMs: 1_000 }));
    const early = await store.acquireTickLease(input({ isolateId: 'isolate-b', nowMs: 1_700_000_000_500 }));
    expect(early.ok).toBe(false);
    const late = await store.acquireTickLease(input({ isolateId: 'isolate-b', nowMs: 1_700_000_001_500 }));
    expect(late.ok).toBe(true);
    if (late.ok) expect(late.data.isolateId).toBe('isolate-b');
  });
});

describe('durable D1 tick lease store (local SQLite semantics)', () => {
  let db: LocalD1Database;
  beforeAll(async () => {
    db = new LocalD1Database(path.join(mkdtempSync(path.join(tmpdir(), 'pr35-lease-')), 'lease.db'));
    const migrationsDir = path.join(process.cwd(), 'migrations');
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
    }
  });

  it('insert-acquire grants once; a second isolate in the same minute is rejected by the PK', async () => {
    const store = createD1TickLeaseStore(db);
    const nowMs = 1_700_000_100_000;
    const first = await store.acquireTickLease(input({ nowMs }));
    expect(first.ok).toBe(true);
    const duplicate = await store.acquireTickLease(input({ nowMs: nowMs + 10, isolateId: 'isolate-b' }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toContain('DUPLICATE_TICK_GUARD');
    expect(await store.activeLeaseCount(nowMs + 10, 'ws-1')).toBe(1);
  });

  it('takes over exactly one expired lease row and refuses live ones', async () => {
    const store = createD1TickLeaseStore(db);
    const nowMs = 1_700_000_200_000;
    await store.acquireTickLease(input({ nowMs, leaseDurationMs: 1_000 }));
    const early = await store.acquireTickLease(input({ nowMs: nowMs + 500, isolateId: 'isolate-b' }));
    expect(early.ok).toBe(false);
    const takeover = await store.acquireTickLease(input({ nowMs: nowMs + 1_500, isolateId: 'isolate-b' }));
    expect(takeover.ok).toBe(true);
    const row = await db.prepare(`SELECT isolate_id, acquired_at_ms, expires_at_ms FROM saas_bot_tick_leases WHERE workspace_id = 'ws-1' AND bot_id = 'bot-1' AND epoch_minute = ?`)
      .bind(Math.floor((nowMs + 1_500) / 60_000)).first<{ isolate_id: string; acquired_at_ms: number; expires_at_ms: number }>();
    expect(row?.isolate_id).toBe('isolate-b');
    expect(row?.expires_at_ms).toBe(nowMs + 1_500 + 55_000);
    const sameMinuteAgain = await store.acquireTickLease(input({ nowMs: nowMs + 1_600, isolateId: 'isolate-c' }));
    expect(sameMinuteAgain.ok).toBe(false);
  });

  it('keeps separate leases per bot and per minute', async () => {
    const store = createD1TickLeaseStore(db);
    const nowMs = 1_700_000_300_000;
    expect((await store.acquireTickLease(input({ nowMs }))).ok).toBe(true);
    expect((await store.acquireTickLease(input({ nowMs, botId: 'bot-2' }))).ok).toBe(true);
    expect((await store.acquireTickLease(input({ nowMs: nowMs + MINUTE }))).ok).toBe(true);
    expect(await store.activeLeaseCount(nowMs + 1)).toBe(3);
  });
});
