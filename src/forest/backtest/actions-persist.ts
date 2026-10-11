import { createServerClient } from '@/lib/db/client';
import type { BacktestResultRow } from '@/lib/db/types';
import type { BacktestResult } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('backtest-actions-persist');

export async function persistBacktestResultToD1(result: BacktestResult): Promise<void> {
  const db = createServerClient();
  if (!db) return;
  try {
    await db.prepare(
      `INSERT INTO backtest_results (id, bot_id, strategy, pair, exchange, start_date, end_date, total_trades, win_count, loss_count, win_rate, total_pnl, max_drawdown, sharpe_ratio, params_json, equity_curve_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      result.id, result.bot_id, result.strategy, result.pair, result.exchange, result.start_date, result.end_date,
      result.total_trades, result.win_count, result.loss_count, result.win_rate, result.total_pnl, result.max_drawdown,
      result.sharpe_ratio, result.params_json, JSON.stringify(result.equity_curve_json), result.created_at,
    ).run();
  } catch (error) {
    log.warn('Backtest result persistence failed (non-fatal)', { action: 'persistBacktest', error: error instanceof Error ? error : new Error(String(error)) });
  }
}

export async function getBacktestResultsFromD1(botId: string): Promise<BacktestResultRow[]> {
  const db = createServerClient();
  if (!db) return [];
  try {
    const { results } = await db.prepare('SELECT * FROM backtest_results WHERE bot_id = ? ORDER BY created_at DESC').bind(botId).all<BacktestResultRow>();
    return results;
  } catch (error) {
    log.error('Failed to fetch backtest results', error instanceof Error ? error : new Error(String(error)), { action: 'getBacktestResults' });
    return [];
  }
}
