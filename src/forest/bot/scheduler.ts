import { getBotManager } from '@/tree/bot';
import type { SchedulerDeps, SchedulerTickReport, SchedulerError } from './scheduler-types';
import { emitExchangeHealthSnapshots } from './scheduler-helpers';
import { tickSingleBot, autoRestartBotIfNeeded } from './scheduler-tick';

export type { SchedulerDeps, SchedulerTickReport, SchedulerError };

export class BotScheduler {
  private deps: SchedulerDeps;
  private tickCount = 0;
  private lastTickAt: number | null = null;
  private rateLimitCounts = new Map<string, number>();

  constructor(deps: SchedulerDeps = {}) { this.deps = deps; }

  async tick(): Promise<SchedulerTickReport> {
    this.tickCount++;
    const now = this.deps.getNow?.() ?? Date.now();
    this.lastTickAt = now;
    this.rateLimitCounts.clear();

    const killswitch = getBotManager().getKillswitch();
    if (!killswitch.isTradingEnabled()) {
      return { tickCount: this.tickCount, botsEvaluated: 0, halted: true, errors: [], rateLimitUsage: {} };
    }

    const manager = getBotManager(), runningBots = await manager.getRunningBots();
    const errors: SchedulerError[] = [], orchestrator = this.deps.getOrchestrator?.();

    for (const bot of runningBots) await autoRestartBotIfNeeded(bot, errors);
    for (const bot of runningBots) await tickSingleBot(bot, this.deps, this.rateLimitCounts, errors);
    if (orchestrator) emitExchangeHealthSnapshots(orchestrator, now, this.rateLimitCounts);
    try { await manager.drainQueues(); } catch { /* best-effort */ }

    return { tickCount: this.tickCount, botsEvaluated: runningBots.length, halted: false, errors, rateLimitUsage: Object.fromEntries(this.rateLimitCounts) };
  }

  getStats() { return { tickCount: this.tickCount, lastTickAt: this.lastTickAt }; }
  getRateLimitUsage(): ReadonlyMap<string, number> { return this.rateLimitCounts; }
}
