// Cloudflare Workers Scheduled Cron Handler — CashClaw Trading Bot Platform
import { getBotManager } from './tree/bot';
import { defaultCloudSchedulerCoordinator } from './ee/scheduler/cloud-scheduler-coordinator';
import type { WorkerEnv } from './worker-env';
import type { ScheduledEvent } from './worker-types';
import type { D1Database } from '@/lib/db/types';

export const cronSchedulerCoordinator = defaultCloudSchedulerCoordinator;

// CF Cron trigger — fires every 5 minutes per wrangler.jsonc [[triggers]]
// Drains exchange request queues and logs outcome for observability.
export async function scheduled(
  event: ScheduledEvent,
  env: WorkerEnv,
  _ctx?: ExecutionContext
): Promise<void> {
  const { createLogger } = await import('@/lib/logger');
  const log = createLogger('cron');

  if (env.CLOUD_LEASE_ENABLED === 'true') {
    const nowMs = event.scheduledTime || Date.now();
    const leaseResult = cronSchedulerCoordinator.acquireTickLease({
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
}
