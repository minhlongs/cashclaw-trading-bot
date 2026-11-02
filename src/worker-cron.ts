// Cloudflare Workers Scheduled Cron Handler — CashClaw Trading Bot Platform
import { getBotManager } from './tree/bot';
import { defaultCloudSchedulerCoordinator } from './ee/scheduler/cloud-scheduler-coordinator';
import { createD1TickLeaseStore, createMemoryTickLeaseStore, type TickLeaseStore } from './ee/scheduler/tick-lease-store';
import type { WorkerEnv } from './worker-env';
import type { ScheduledEvent } from './worker-types';
import type { D1Database } from '@/lib/db/types';

export const cronSchedulerCoordinator = defaultCloudSchedulerCoordinator;

// Resolve the lease store for the cron path. Durability rules (do not weaken):
//   - DB binding present  -> durable D1 store (cross-isolate, survives restarts).
//   - No DB + CASHCLAW_ALLOW_MEMORY_LEASE=true  -> in-memory store, TEST-ONLY single-isolate
//     fallback (logged as such; never described as 24/7 or multi-isolate safe).
//   - No DB otherwise     -> the lease-protected work must NOT run; the caller stops loudly.
export function resolveCronLeaseStore(env: WorkerEnv): TickLeaseStore | null {
  const db = env.DB as D1Database | undefined;
  if (db && typeof db.prepare === 'function') return createD1TickLeaseStore(db);
  if (env.CASHCLAW_ALLOW_MEMORY_LEASE === 'true') return createMemoryTickLeaseStore();
  return null;
}

// Retention cleanup for temporary scheduling state. Attempts and approval audit are NEVER deleted
// (they are required history); only expired leases and old delivered/suppressed dispatch rows go.
export async function cleanupSchedulerState(db: D1Database, nowMs: number): Promise<{ leasesPurged: number; dispatchPurged: number }> {
  const leases = await db.prepare(`DELETE FROM saas_bot_tick_leases WHERE expires_at_ms < ? RETURNING workspace_id`)
    .bind(nowMs - 86_400_000).all<{ workspace_id: string }>();
  const dispatch = await db.prepare(
    `DELETE FROM saas_alert_dispatch_log WHERE status IN ('sent', 'suppressed') AND updated_at_ms < ? RETURNING event_id`,
  ).bind(nowMs - 2_592_000_000).all<{ event_id: string }>();
  return { leasesPurged: leases.results.length, dispatchPurged: dispatch.results.length };
}

// CF Cron trigger — fires every 5 minutes per wrangler.jsonc [[triggers]]
// Drains exchange request queues and logs outcome for observability.
// Missed-tick policy: ticks are NOT backfilled — only work due at drain time runs; a backlog of
// due items is processed one attempt each per drain (no burst execution of historical ticks).
export async function scheduled(
  event: ScheduledEvent,
  env: WorkerEnv,
  _ctx?: ExecutionContext
): Promise<void> {
  const { createLogger } = await import('@/lib/logger');
  const log = createLogger('cron');

  const nowMs = event.scheduledTime || Date.now();
  if (env.CLOUD_LEASE_ENABLED === 'true') {
    const store = resolveCronLeaseStore(env);
    if (!store) {
      // Durability is required but unavailable: stop loudly instead of silently degrading.
      log.error('cron lease store unavailable (no DB binding and memory lease not explicitly allowed); skipping lease-protected work', new Error('cron-lease-missing-db'), { action: 'cron-lease-missing-db' });
      return;
    }
    const leaseResult = await store.acquireTickLease({
      botId: 'cron-queue-drainer',
      workspaceId: 'global-cloud',
      isolateId: env.ISOLATE_ID ?? 'worker-isolate-1',
      nowMs,
    });
    if (!leaseResult.ok) {
      log.warn(leaseResult.error, { action: 'cron-lease-skip' });
      return;
    }
  }

  const manager = getBotManager();
  // BotManager reads D1 directly — no separate hydration phase needed.
  const report = await manager.drainQueues();
  const entries = Object.values(report);
  const total = entries.reduce((sum, e) => sum + e.processed + e.skipped + e.pending, 0);
  if (total > 0) {
    log.info(`drained ${total} across ${entries.length} exchange queues`, {
      processed: entries.reduce((s, e) => s + e.processed, 0),
    });
  }

  // Microstructure ingest — isolated so a failure never breaks drainQueues.
  if (env.MICRO_INGEST_ENABLED === 'true') {
    try {
      const { runMicroIngest } = await import('./forest/alpha/microstructure/ingest-pipeline');
      const { createD1MicroStore } = await import('./forest/alpha/persistence/micro-d1-store');
      const { fetchDepth, fetchAggTrades } = await import('./forest/alpha/microstructure/binance-rest');

      const db = env.DB as D1Database;
      const store = createD1MicroStore(db);
      const symbols = (env.MICRO_INGEST_SYMBOLS ?? 'BTCUSDT')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const ingestReport = await runMicroIngest({
        store,
        fetchDepth: (symbol) => fetchDepth({ symbol }),
        fetchTrades: (symbol, startMs, endMs) => fetchAggTrades({ symbol, startMs, endMs }),
        now: () => Date.now(),
        symbols,
        gitSha: env.VERSION ?? undefined,
      });

      const okCount = ingestReport.outcomes.filter((o) => o.status === 'OK').length;
      const failCount = ingestReport.outcomes.length - okCount;
      log.info(`micro-ingest: ${okCount} ok, ${failCount} failed`, {
        action: 'micro-ingest',
        symbols: symbols.length,
      });
    } catch (err) {
      log.error('micro-ingest crashed (isolated)', err instanceof Error ? err : new Error(String(err)), {
        action: 'micro-ingest',
      });
    }
  }

  // Approved outbound_message auto-retry within the approved attempt budget (owner decision:
  // duplicates accepted). Explicit opt-in; never retries anything outside approved outbound_message.
  if (env.CASHCLAW_OPS_AUTORETRY_ENABLED === 'true') {
    await runOpsAutoRetry(env, nowMs, log);
  }
}

interface CronLogger {
  info(message: string, meta?: unknown): void;
  error(message: string, error?: Error, meta?: unknown): void;
}

async function runOpsAutoRetry(env: WorkerEnv, nowMs: number, log: CronLogger): Promise<void> {
  try {
    const db = env.DB as D1Database | undefined;
    if (!db || typeof db.prepare !== 'function') {
      log.error('ops auto-retry requires a DB binding; skipping (fail closed)', new Error('ops-auto-retry-no-db'), { action: 'ops-auto-retry-no-db' });
      return;
    }
    const { drainDueActionRetries } = await import('./ee/ops/action-execution-runner');
    const { createSendersFromEnv } = await import('./ee/alerts/alert-channel-senders');
    const outcomes = await drainDueActionRetries({
      db,
      senders: createSendersFromEnv(env as unknown as Record<string, string | undefined>),
      nowMs,
      claimedBy: env.ISOLATE_ID ?? 'cron',
    });
    if (outcomes.length > 0) {
      log.info(`ops auto-retry: ${outcomes.filter((o) => o.ok).length} accepted, ${outcomes.filter((o) => !o.ok).length} not`, { action: 'ops-auto-retry' });
    }
    const cleanup = await cleanupSchedulerState(db, nowMs);
    if (cleanup.leasesPurged + cleanup.dispatchPurged > 0) {
      log.info(`scheduler cleanup: ${cleanup.leasesPurged} leases, ${cleanup.dispatchPurged} dispatch rows`, { action: 'scheduler-cleanup' });
    }
  } catch (err) {
    log.error('ops auto-retry crashed (isolated)', err instanceof Error ? err : new Error(String(err)), {
      action: 'ops-auto-retry',
    });
  }
}
