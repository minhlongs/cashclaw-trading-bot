// Forest layer — Exchange health dashboard data
// Provides per-exchange health metrics for the dashboard.

'use server';

import { getExchangeOrchestrator } from '@/land/exchange-orchestration';
import type { ExchangeId } from '@/tree/exchange/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('dashboard-exchange-health');

export interface ExchangeHealthCard {
  exchangeId: string;
  score: number;
  state: string;
  latencyMs: number;
  failureCount: number;
  isCircuitOpen: boolean;
  backoffMs: number;
  rateLimitReqPerMin: number;
}

export async function getExchangeHealth(): Promise<ExchangeHealthCard[]> {
  const orchestrator = getExchangeOrchestrator();
  const exchanges: ExchangeId[] = ['binance', 'bybit', 'okx'];

  return exchanges.map((id) => {
    try {
      const provider = orchestrator.getProvider(id);
      if (!provider) {
        return {
          exchangeId: id,
          score: 0,
          state: 'not_registered',
          latencyMs: 0,
          failureCount: 0,
          isCircuitOpen: false,
          backoffMs: 0,
          rateLimitReqPerMin: 0,
        };
      }

      const health = provider.getHealth();
      const budget = provider.getBudget();

      return {
        exchangeId: id,
        score: health.score,
        state: provider.isCircuitOpen() ? 'circuit_open' : health.score >= 80 ? 'healthy' : health.score >= 50 ? 'degraded' : 'unhealthy',
        latencyMs: health.latencyMs,
        failureCount: health.failureCount,
        isCircuitOpen: provider.isCircuitOpen(),
        backoffMs: provider.getBackoffMs(),
        rateLimitReqPerMin: budget.reqPerMin,
      };
    } catch (err) {
      log.warn('Failed to get health for exchange', { exchangeId: id, error: err instanceof Error ? err : new Error(String(err)) });
      return {
        exchangeId: id,
        score: 0,
        state: 'error',
        latencyMs: 0,
        failureCount: 0,
        isCircuitOpen: false,
        backoffMs: 0,
        rateLimitReqPerMin: 0,
      };
    }
  });
}
