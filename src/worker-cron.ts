// Cloudflare Workers Scheduled Cron Handler — CashClaw Trading Bot Platform
import { getBotManager } from './tree/bot';
import {
  defaultCloudSchedulerCoordinator,
  type BotTickLease,
  type LeaseD1DatabaseLike,
} from './ee/scheduler/cloud-scheduler-coordinator';
import type { ExecutionBudgetGuard } from './ee/scheduler/d1-lease-store';
import type { WorkerEnv } from './worker-env';
import type { ScheduledEvent } from './worker-types';
import type { D1Database } from '@/lib/db/types';

export const cronSchedulerCoordinator = defaultCloudSchedulerCoordinator;
type CronLogger = ReturnType<typeof import('@/lib/logger').createLogger>;
const DEFAULT_ISOLATE_ID = `worker-isolate-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID().slice(0, 8) : 'local'}`;

async function runScheduledMicroIngest(
  env: WorkerEnv,
  budgetGuard: ExecutionBudgetGuard,
  log: CronLogger,
): Promise<void> {
  try {
    const symbols = (env.MICRO_INGEST_SYMBOLS ?? 'BTCUSDT')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const symbol of symbols) {
      const budgetRes = budgetGuard.recordSubrequest(1);
      if (!budgetRes.ok) {
        log.warn(budgetRes.error, { action: 'micro-ingest-budget-abort', symbol });
        return;
      }
    }

    const { runMicroIngest } = await import('./forest/alpha/microstructure/ingest-pipeline');
    const { createD1MicroStore } = await import('./forest/alpha/persistence/micro-d1-store');
    const { fetchDepth, fetchAggTrades } = await import('./forest/alpha/microstructure/binance-rest');

    const db = env.DB as D1Database;
    const store = createD1MicroStore(db);
    const ingestReport = await runMicroIngest({
      store,
      fetchDepth: async (symbol) => {
        const b = budgetGuard.recordAdapterCall(1);
        if (!b.ok) throw new Error(b.error);
        return fetchDepth({ symbol });
      },
      fetchTrades: async (symbol, startMs, endMs) => {
        const b = budgetGuard.recordAdapterCall(1);
        if (!b.ok) throw new Error(b.error);
        return fetchAggTrades({ symbol, startMs, endMs });
      },
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

// CF Cron trigger — fires every 5 minutes per wrangler.jsonc [[triggers]]
// Acquires fail-closed durable D1 CAS lease (when D1 is bound), enforces ExecutionBudgetGuard,
// drains exchange request queues, and releases lease with monotonic fencingToken in finally.
export async function scheduled(
  event: ScheduledEvent,
  env: WorkerEnv,
  _ctx?: ExecutionContext,
): Promise<void> {
  const { createLogger } = await import('@/lib/logger');
  const log = createLogger('cron');

  const d1Db = env.DB ? (env.DB as unknown as LeaseD1DatabaseLike) : undefined;
  let activeDurableLease: BotTickLease | null = null;
  const shouldAcquireLease =
    env.CLOUD_LEASE_ENABLED !== 'false' && (Boolean(d1Db) || env.CLOUD_LEASE_ENABLED === 'true');

  if (shouldAcquireLease) {
    const nowMs = event.scheduledTime || Date.now();
    const leaseInput = {
      botId: 'cron-queue-drainer',
      workspaceId: 'global-cloud',
      isolateId: env.ISOLATE_ID ?? DEFAULT_ISOLATE_ID,
      nowMs,
    };
    const leaseResult = d1Db
      ? await cronSchedulerCoordinator.acquireDurableTickLease(leaseInput, d1Db)
      : cronSchedulerCoordinator.acquireTickLease(leaseInput);

    if (!leaseResult.ok) {
      if (leaseResult.error.startsWith('DUPLICATE_TICK_GUARD')) {
        log.warn(leaseResult.error, { action: 'cron-lease-skip' });
      } else {
        log.error('cron lease failed (fail-closed)', new Error(leaseResult.error), {
          action: 'cron-lease-abort',
        });
      }
      return;
    }
    if (d1Db) activeDurableLease = leaseResult.data;
  }

  const budgetGuard = cronSchedulerCoordinator.createExecutionBudgetGuard();
  try {
    const tickOutcome = await budgetGuard.executeTick(async () => {
      const drainBudget = budgetGuard.recordSubrequest(1);
      if (!drainBudget.ok) {
        log.warn(drainBudget.error, { action: 'cron-budget-abort' });
        return;
      }

      const manager = getBotManager();
      const report = await manager.drainQueues();
      const entries = Object.values(report);
      const total = entries.reduce((sum, e) => sum + e.processed + e.skipped + e.pending, 0);
      if (total > 0) {
        log.info(`drained ${total} across ${entries.length} exchange queues`, {
          processed: entries.reduce((s, e) => s + e.processed, 0),
        });
      }

      if (env.MICRO_INGEST_ENABLED === 'true') {
        await runScheduledMicroIngest(env, budgetGuard, log);
      }
    });

    if (!tickOutcome.ok) {
      log.error('cron tick aborted', new Error(tickOutcome.error), { action: 'cron-tick-abort' });
    }
  } finally {
    if (d1Db && activeDurableLease) {
      const releaseNowMs = Math.max(Date.now(), activeDurableLease.acquiredAtMs + 1);
      const releaseRes = await cronSchedulerCoordinator.releaseDurableTickLease(
        activeDurableLease.botId,
        activeDurableLease.isolateId,
        activeDurableLease.fencingToken,
        releaseNowMs,
        d1Db,
      );
      if (!releaseRes.ok) {
        log.warn(releaseRes.error, { action: 'cron-lease-release' });
      }
    }
  }
}
