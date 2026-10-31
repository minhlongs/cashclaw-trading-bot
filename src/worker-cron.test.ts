import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalD1Database } from '@/ee/billing/__tests__/local-d1-adapter';

const drainQueues = vi.fn().mockResolvedValue({});
vi.mock('./tree/bot', () => ({ getBotManager: () => ({ drainQueues }) }));

import { resolveCronLeaseStore, scheduled } from './worker-cron';
import { createMemoryTickLeaseStore } from './ee/scheduler/tick-lease-store';
import type { WorkerEnv } from './worker-env';

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return { CLOUD_LEASE_ENABLED: 'true', ISOLATE_ID: 'isolate-1', ...overrides } as unknown as WorkerEnv;
}

function event(nowMs = 1_700_000_000_000) {
  return { scheduledTime: nowMs, cron: '*/5 * * * *' };
}

beforeAll(async () => {
  // LocalD1Database used per-test where needed.
});

describe('resolveCronLeaseStore', () => {
  it('uses the durable D1 store when a database binding exists and memory otherwise', async () => {
    const db = new LocalD1Database(path.join(mkdtempSync(path.join(tmpdir(), 'pr35-cron-')), 'cron.db'));
    const migrationsDir = path.join(process.cwd(), 'migrations');
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
    }
    const durable = resolveCronLeaseStore(env({ DB: db }));
    const first = await durable.acquireTickLease({ botId: 'cron-queue-drainer', workspaceId: 'global-cloud', isolateId: 'isolate-1', nowMs: 1_700_000_000_000 });
    expect(first.ok).toBe(true);
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM saas_bot_tick_leases`).first<{ n: number }>();
    expect(row?.n).toBe(1);

    const memory = resolveCronLeaseStore(env({ DB: undefined }));
    expect(memory).toBeDefined();
    const memoryStore = createMemoryTickLeaseStore();
    expect((await memoryStore.acquireTickLease({ botId: 'b', workspaceId: 'w', isolateId: 'i', nowMs: 1 })).ok).toBe(true);
  });
});

describe('scheduled cron handler', () => {
  it('drains queues when the drainer lease is free and skips when another isolate holds it', async () => {
    drainQueues.mockClear();
    const db = new LocalD1Database(path.join(mkdtempSync(path.join(tmpdir(), 'pr35-cron2-')), 'cron2.db'));
    const migrationsDir = path.join(process.cwd(), 'migrations');
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
    }
    await scheduled(event(), env({ DB: db }));
    expect(drainQueues).toHaveBeenCalledTimes(1);
    await scheduled(event(), env({ DB: db, ISOLATE_ID: 'isolate-2' }));
    expect(drainQueues).toHaveBeenCalledTimes(1);
  });

  it('still drains without the lease gate when disabled', async () => {
    drainQueues.mockClear();
    await scheduled(event(), env({ CLOUD_LEASE_ENABLED: 'false', DB: undefined }));
    expect(drainQueues).toHaveBeenCalledTimes(1);
    await scheduled(event(), env({ CLOUD_LEASE_ENABLED: 'false', DB: undefined }));
    expect(drainQueues).toHaveBeenCalledTimes(2);
  });
});
