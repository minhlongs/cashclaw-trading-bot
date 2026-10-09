import type { BotInstance } from '@/tree/bot/bot-instance';
import type { SchedulerDeps, SchedulerError } from './scheduler-types';
import { persistBotState } from './scheduler-helpers';

export async function tickSingleBot(
  bot: BotInstance,
  deps: SchedulerDeps,
  rateLimitCounts: Map<string, number>,
  errors: SchedulerError[],
): Promise<void> {
  const orchestrator = deps.getOrchestrator?.();
  if (orchestrator) {
    const cfg = bot.getConfig() as { exchange: string };
    const provider = orchestrator.getProvider(cfg.exchange);
    if (provider?.isCircuitOpen()) {
      deps.onEvalError?.(bot.id, new Error(`Circuit open for ${cfg.exchange} — skipping ${bot.id}`));
      return;
    }
    rateLimitCounts.set(cfg.exchange, (rateLimitCounts.get(cfg.exchange) ?? 0) + 1);
  }

  try {
    await bot.tick();
    await persistBotState(bot);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    errors.push({ botId: bot.id, message: error.message });
    deps.onEvalError?.(bot.id, error);
  }
}

export async function autoRestartBotIfNeeded(bot: BotInstance, errors: SchedulerError[]): Promise<void> {
  if (!bot.hasStrategy()) {
    try {
      await bot.start();
    } catch (err) {
      errors.push({ botId: bot.id, message: `Auto-restart failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}
