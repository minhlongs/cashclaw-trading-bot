// Bot Scheduler — eval loop for running bots
// Runs inside CF Workers: polls BotManager, ticks each running bot, persists state.
// In production: triggered by CF Cron (1min interval); here: manual tick() for tests.

import { getBotManager } from '@/tree/bot';
import type {
  SchedulerDeps,
  SchedulerTickReport,
  SchedulerError,
} from './scheduler-types';
import {
  emitExchangeHealthSnapshots,
  persistBotState,
} from './scheduler-helpers';

export type {
  SchedulerDeps,
  SchedulerTickReport,
  SchedulerError,
};

export class BotScheduler {
  private deps: SchedulerDeps;
  private tickCount = 0;
  private lastTickAt: number | null = null;
  private rateLimitCounts = new Map<string, number>();

  constructor(deps: SchedulerDeps = {}) {
    this.deps = deps;
  }

  /** Single eval tick — process all running bots */
  async tick(): Promise<SchedulerTickReport> {
    this.tickCount++;
    const now = this.deps.getNow?.() ?? Date.now();
    this.lastTickAt = now;
    this.rateLimitCounts.clear();

    const killswitch = getBotManager().getKillswitch();
    if (!killswitch.isTradingEnabled()) {
      return { tickCount: this.tickCount, botsEvaluated: 0, halted: true, errors: [], rateLimitUsage: {} };
    }

    // Read running bots directly from D1 (source of truth). The BotManager
    // now reads D1 directly with a short-TTL cache, so no separate
    // hydration phase is needed — cold starts are handled transparently.
    const manager = getBotManager();
    const runningBots = await manager.getRunningBots();

    const errors: SchedulerError[] = [];
    const orchestrator = this.deps.getOrchestrator?.();

    // Auto-restart bots that were running before cold start but lost their
    // strategy instance. After hydration they report `running` in status but
    // have no tick cycle — start() reinitializes the strategy with a fresh
    // ticker price. Paper-only, so no credentials are needed.
    for (const bot of runningBots) {
      if (!bot.hasStrategy()) {
        try {
          await bot.start();
        } catch (err) {
          errors.push({
            botId: bot.id,
            message: `Auto-restart failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    }

    for (const bot of runningBots) {
      // Circuit-open guard: skip bot if its exchange provider circuit is open.
      // getProvider is public; if no provider registered yet, circuit can't be open.
      if (orchestrator) {
        const cfg = bot.getConfig() as { exchange: string };
        const provider = orchestrator.getProvider(cfg.exchange);
        if (provider?.isCircuitOpen()) {
          const skipErr = new Error(`Circuit open for ${cfg.exchange} — skipping ${bot.id}`);
          this.deps.onEvalError?.(bot.id, skipErr);
          continue;
        }
        // Track rate-limit usage per exchange
        const exId = cfg.exchange;
        this.rateLimitCounts.set(exId, (this.rateLimitCounts.get(exId) ?? 0) + 1);
      }

      try {
        await bot.tick();
        await persistBotState(bot);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push({ botId: bot.id, message: error.message });
        this.deps.onEvalError?.(bot.id, error);
      }
    }

    // Emit exchange health snapshots for observability
    if (orchestrator) {
      emitExchangeHealthSnapshots(orchestrator, now, this.rateLimitCounts);
    }

    // Drain exchange queues after all bots ticked
    try {
      await manager.drainQueues();
    } catch {
      // Queue drain is best-effort — log and continue
    }

    return {
      tickCount: this.tickCount,
      botsEvaluated: runningBots.length,
      halted: false,
      errors,
      rateLimitUsage: Object.fromEntries(this.rateLimitCounts),
    };
  }

  getStats() {
    return { tickCount: this.tickCount, lastTickAt: this.lastTickAt };
  }

  getRateLimitUsage(): ReadonlyMap<string, number> {
    return this.rateLimitCounts;
  }
}
