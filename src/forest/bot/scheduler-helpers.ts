// Bot scheduler helpers for D1 persistence and exchange health telemetry.

import { createServerClient } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import type { BotInstance } from '@/tree/bot/bot-instance';
import type { ExchangeOrchestrator } from '@/land/exchange-orchestration';

const log = createLogger('scheduler');

export function emitExchangeHealthSnapshots(
  orchestrator: ExchangeOrchestrator,
  _now: number,
  rateLimitCounts: ReadonlyMap<string, number>,
): void {
  const exchanges = ['binance', 'bybit', 'okx'] as const;
  for (const exId of exchanges) {
    const provider = orchestrator.getProvider(exId);
    if (!provider || typeof provider.getHealth !== 'function') continue;
    try {
      const health = provider.getHealth();
      const budget = provider.getBudget();
      log.debug('Exchange health', {
        exchange: exId,
        score: health.score,
        latency: health.latencyMs,
        failures: health.failureCount,
        rateLimitUsed: rateLimitCounts.get(exId) ?? 0,
        rateLimitTotal: budget.reqPerMin,
      });
    } catch {
      // Provider may be a mock or incomplete — skip silently
    }
  }
}

export async function persistBotState(bot: BotInstance): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const state = bot.getSnapshot();

  try {
    await db
      .prepare(`UPDATE bots SET total_pnl = ?, updated_at = ? WHERE id = ?`)
      .bind(state.totalPnl, Date.now(), state.id)
      .run();
  } catch (error) {
    log.warn('D1 persist failed (non-fatal)', { action: 'persistBot', error: error instanceof Error ? error : new Error(String(error)) });
  }
}
