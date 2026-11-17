'use server';

import { validateBacktestInput, type CandleInterval } from './actions.validation';
import type { BacktestRunInput, BacktestRunOutput } from './actions.types';
import { fetchAndSimulateBacktest } from './actions-execute';
import {
  getBacktestResultsFromD1,
  persistBacktestResultToD1,
  resolveBacktestSessionUser,
  verifyBacktestBotOwnership,
} from './actions-persist';

export type { BacktestRunInput, BacktestRunOutput } from './actions.types';

export async function runBacktestAction(
  input: BacktestRunInput,
): Promise<BacktestRunOutput> {
  const interval = (input.interval ?? '1h') as CandleInterval;
  const validationError = validateBacktestInput(input, interval);
  if (validationError) return { success: false, error: validationError, candlesFetched: 0 };

  const session = await resolveBacktestSessionUser();
  if (!session.userId) {
    return { success: false, error: 'Authentication required', candlesFetched: 0 };
  }
  const ownsBot = await verifyBacktestBotOwnership(input.botId, session.userId);
  if (!ownsBot) {
    return { success: false, error: `Bot not found: ${input.botId}`, candlesFetched: 0 };
  }

  const sim = await fetchAndSimulateBacktest(input, interval);
  if (sim.error || !sim.result) {
    return { success: false, error: sim.error, candlesFetched: sim.candlesFetched };
  }
  await persistBacktestResultToD1(sim.result);
  return { success: true, result: sim.result, candlesFetched: sim.candlesFetched };
}

export async function getBacktestResults(botId: string) {
  const session = await resolveBacktestSessionUser();
  if (!session.userId) return [];
  return getBacktestResultsFromD1(botId, session.userId);
}
