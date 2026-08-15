// Backtest Server Actions — trigger backtest runs and persist results to D1

'use server';

import { fetchOHLCV } from './data-fetcher';
import { runBacktest, type BacktestResult } from './engine';
import type { BotConfig } from '@/tree/bot/types';
import { createServerClient } from '@/lib/db/client';
import type { BacktestResultRow } from '@/lib/db/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('backtest-actions');

const SUPPORTED_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
type CandleInterval = (typeof SUPPORTED_INTERVALS)[number];

export interface BacktestRunInput {
  botId: string;
  exchange: string;
  symbol: string;
  strategy: string;
  config: BotConfig;
  startDate: Date;
  endDate: Date;
  interval?: string;
  feePct?: number;
  slippagePct?: number;
  initialCapital?: number;
}

export interface BacktestRunOutput {
  success: boolean;
  result?: BacktestResult;
  error?: string;
  candlesFetched: number;
}

/**
 * Run a full backtest: fetch OHLCV → simulate strategy → persist result to D1.
 */
export async function runBacktestAction(input: BacktestRunInput): Promise<BacktestRunOutput> {
  const interval = (input.interval ?? '1h') as CandleInterval;
  const validationError = validateBacktestInput(input, interval);
  if (validationError) return { success: false, error: validationError, candlesFetched: 0 };

  const startMs = input.startDate.getTime();
  const endMs = input.endDate.getTime();

  let candles;
  try {
    candles = await fetchOHLCV(input.exchange, input.symbol, interval, startMs, endMs);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch OHLCV data',
      candlesFetched: 0,
    };
  }

  if (candles.length < 2) {
    return { success: false, error: `Insufficient data: only ${candles.length} candles`, candlesFetched: candles.length };
  }

  let result;
  try {
    result = runBacktest({
      config: input.config,
      candles,
      feePct: input.feePct ?? 0.1,
      slippagePct: input.slippagePct ?? 0.05,
      initialCapital: input.initialCapital ?? input.config.capital,
      botId: input.botId,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Backtest engine failed',
      candlesFetched: candles.length,
    };
  }

  // Persist to D1
  const db = createServerClient();
  if (db) {
    try {
      await db
        .prepare(
          `INSERT INTO backtest_results
           (id, bot_id, strategy, pair, exchange, start_date, end_date,
            total_trades, win_count, loss_count, win_rate, total_pnl, max_drawdown,
            sharpe_ratio, params_json, equity_curve_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          result.id,
          result.bot_id,
          result.strategy,
          result.pair,
          result.exchange,
          result.start_date,
          result.end_date,
          result.total_trades,
          result.win_count,
          result.loss_count,
          result.win_rate,
          result.total_pnl,
          result.max_drawdown,
          result.sharpe_ratio,
          result.params_json,
          JSON.stringify(result.equity_curve_json),
          result.created_at,
        )
        .run();
    } catch (error) {
      log.warn('Backtest result persistence failed (non-fatal)', { action: 'persistBacktest', error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  return { success: true, result, candlesFetched: candles.length };
}

function validateBacktestInput(input: BacktestRunInput, interval: CandleInterval): string | null {
  if (!SUPPORTED_INTERVALS.includes(interval)) return `Unsupported interval: ${input.interval}`;
  if (input.endDate.getTime() <= input.startDate.getTime()) return 'endDate must be after startDate';
  const threeYearsMs = 3 * 365 * 24 * 3600 * 1000;
  if (input.endDate.getTime() - input.startDate.getTime() > threeYearsMs) return 'Date range exceeds 3-year limit';
  return null;
}

/**
 * Fetch backtest results for a bot from D1.
 */
export async function getBacktestResults(botId: string) {
  const db = createServerClient();
  if (!db) return [];
  try {
    const { results } = await db
      .prepare('SELECT * FROM backtest_results WHERE bot_id = ? ORDER BY created_at DESC')
      .bind(botId)
      .all<BacktestResultRow>();
    return results;
  } catch (error) {
    log.error('Failed to fetch backtest results', error instanceof Error ? error : new Error(String(error)), { action: 'getBacktestResults' });
    return [];
  }
}
