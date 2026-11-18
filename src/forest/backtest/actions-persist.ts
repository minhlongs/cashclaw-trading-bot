import { cookies } from 'next/headers';
import { resolveServerSessionUser } from '@/lib/auth/session-resolver';
import { createServerClient } from '@/lib/db/client';
import { findBotById } from '@/lib/db/repositories';
import type { BacktestResultRow, D1Database } from '@/lib/db/types';
import { createLogger } from '@/lib/logger';
import type { BacktestResult } from './types';

const log = createLogger('backtest-actions');

export interface RequestSessionResolution {
  inRequestScope: boolean;
  userId?: string;
}

export async function resolveBacktestSessionUser(
  db?: D1Database | null,
): Promise<RequestSessionResolution> {
  let cookieStore: Awaited<ReturnType<typeof cookies>>;
  try {
    cookieStore = await cookies();
  } catch {
    return { inRequestScope: false, userId: undefined };
  }

  const sessionId = cookieStore.get('session_id')?.value?.trim();
  if (!sessionId) {
    return { inRequestScope: true, userId: undefined };
  }

  const resolved = await resolveServerSessionUser(sessionId, db);
  if (resolved.status === 'valid') {
    return { inRequestScope: true, userId: resolved.userId };
  }
  return { inRequestScope: true, userId: undefined };
}

export async function verifyBacktestBotOwnership(
  botId: string,
  userId: string,
): Promise<boolean> {
  if (!userId.trim()) return false;
  const db = createServerClient();
  if (!db) {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  }
  try {
    const bot = await findBotById(db, botId);
    return Boolean(bot && bot.user_id === userId);
  } catch (error) {
    log.error(
      'Failed to verify bot ownership for backtest',
      error instanceof Error ? error : new Error(String(error)),
    );
    return false;
  }
}

export async function persistBacktestResultToD1(
  result: BacktestResult,
  userId: string,
): Promise<void> {
  const trimmedUserId = userId?.trim();
  if (!trimmedUserId) return;
  const db = createServerClient();
  if (!db) return;
  try {
    const bot = await findBotById(db, result.bot_id);
    if (!bot || bot.user_id !== trimmedUserId) return;
    await db
      .prepare(
        `INSERT INTO backtest_results (id, bot_id, strategy, pair, exchange, start_date, end_date, total_trades, win_count, loss_count, win_rate, total_pnl, max_drawdown, sharpe_ratio, params_json, equity_curve_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM bots WHERE id = ? AND user_id = ?`,
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
        result.bot_id,
        trimmedUserId,
      )
      .run();
  } catch (error) {
    log.warn('Backtest result persistence failed (non-fatal)', {
      action: 'persistBacktest',
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export async function getBacktestResultsFromD1(
  botId: string,
  userId: string,
): Promise<BacktestResultRow[]> {
  if (!userId.trim()) return [];
  const db = createServerClient();
  if (!db) return [];
  try {
    const bot = await findBotById(db, botId);
    if (!bot || bot.user_id !== userId) return [];
    const { results } = await db
      .prepare(
        'SELECT br.* FROM backtest_results br INNER JOIN bots b ON br.bot_id = b.id WHERE br.bot_id = ? AND b.user_id = ? ORDER BY br.created_at DESC',
      )
      .bind(botId, userId)
      .all<BacktestResultRow>();
    return results;
  } catch (error) {
    log.error(
      'Failed to fetch backtest results',
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}
