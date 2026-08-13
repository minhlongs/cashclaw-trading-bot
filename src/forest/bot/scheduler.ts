// Bot Scheduler — eval loop for running bots
// Runs inside CF Workers: polls BotManager, ticks each running bot, persists state.
// In production: triggered by CF Cron (1min interval); here: manual tick() for tests.

import { getBotManager } from '@/tree/bot';
import { Killswitch } from '@/tree/bot/killswitch';
import { getExchangeOrchestrator, type ExchangeOrchestrator } from '@/land/exchange-orchestration';
import { createServerClient } from '@/lib/db/client';
import { TelemetryWriter } from '@/tree/telemetry/writer';
import type { BotInstance } from '@/tree/bot/bot-instance';
import { createLogger } from '@/lib/logger';

const log = createLogger('scheduler');

export interface SchedulerDeps {
  getNow?: () => number; // override for testing
  onEvalError?: (botId: string, error: Error) => void;
  /** Optional: return the ExchangeOrchestrator for circuit-open checks before tick */
  getOrchestrator?: () => ExchangeOrchestrator;
}

export class BotScheduler {
  private deps: SchedulerDeps;
  private tickCount = 0;
  private lastTickAt: number | null = null;

  constructor(deps: SchedulerDeps = {}) {
    this.deps = deps;
  }

  /** Single eval tick — process all running bots */
  async tick(): Promise<SchedulerTickReport> {
    this.tickCount++;
    const now = this.deps.getNow?.() ?? Date.now();
    this.lastTickAt = now;

    const killswitch = getBotManager().getKillswitch();
    if (!killswitch.isTradingEnabled()) {
      return { tickCount: this.tickCount, botsEvaluated: 0, halted: true, errors: [] };
    }

    const manager = getBotManager();
    const runningBots = manager.getRunningBots();

    const errors: SchedulerError[] = [];
    const orchestrator = this.deps.getOrchestrator?.();

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
      }

      try {
        await bot.tick();
        await this.persistBotState(bot);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push({ botId: bot.id, message: error.message });
        this.deps.onEvalError?.(bot.id, error);
      }
    }

    return { tickCount: this.tickCount, botsEvaluated: runningBots.length, halted: false, errors };
  }

  getStats() {
    return { tickCount: this.tickCount, lastTickAt: this.lastTickAt };
  }

  /** Persist bot state snapshot to D1 after each tick */
  private async persistBotState(bot: BotInstance): Promise<void> {
    const db = createServerClient();
    if (!db) return;

    const state = bot.getSnapshot();
    const config = bot.getConfig() as { capital: number; symbol: string; exchange: string };

    try {
      await db
        .prepare(`UPDATE bots SET total_pnl = ?, updated_at = ? WHERE id = ?`)
        .bind(state.totalPnl, Date.now(), state.id)
        .run();
    } catch (error) {
      log.warn('D1 persist failed (non-fatal)', { action: 'persistBot', error: error instanceof Error ? error : new Error(String(error)) });
    }
  }
}

export interface SchedulerTickReport {
  tickCount: number;
  botsEvaluated: number;
  halted: boolean;
  errors: SchedulerError[];
}

export interface SchedulerError {
  botId: string;
  message: string;
}
