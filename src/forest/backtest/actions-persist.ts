import { cookies, headers } from 'next/headers';
import { createServerClient } from '@/lib/db/client';
import { findBotById } from '@/lib/db/repositories';
import type { BacktestResultRow, D1Database } from '@/lib/db/types';
import type { BacktestResult } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('backtest-actions-persist');

export interface RequestSessionResolution {
  readonly inRequestScope: boolean;
  readonly userId: string | undefined;
}

export async function resolveBacktestSessionUser(
  db?: D1Database | null,
): Promise<RequestSessionResolution> {
  let reqHeaders: Awaited<ReturnType<typeof headers>>;
  try {
    reqHeaders = await headers();
  } catch {
    return { inRequestScope: false, userId: undefined };
  }

  const verifiedHeaderUser = reqHeaders.get('x-user-id')?.trim();
  if (verifiedHeaderUser) {
    return { inRequestScope: true, userId: verifiedHeaderUser };
  }

  let sessionId: string | undefined;
  try {
    const cookieStore = await cookies();
    sessionId = cookieStore.get('session_id')?.value?.trim();
  } catch {
    sessionId = undefined;
  }
  if (!sessionId) {
    return { inRequestScope: true, userId: undefined };
  }

  const client = db ?? createServerClient();
  if (client) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const { results } = await client
        .prepare('SELECT user_id, expires_at FROM user_sessions WHERE id = ?')
        .bind(sessionId)
        .all<{ user_id: string; expires_at: number }>();
      if (results.length > 0 && results[0]!.expires_at >= now) {
        return { inRequestScope: true, userId: results[0]!.user_id };
      }
      return { inRequestScope: true, userId: undefined };
    } catch {
      return { inRequestScope: true, userId: undefined };
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return { inRequestScope: true, userId: undefined };
  }
  const safeDevSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'local';
  return { inRequestScope: true, userId: `dev_${safeDevSession}` };
}

export async function verifyBacktestBotOwnership(
  botId: string,
  userId: string,
): Promise<boolean> {
  const db = createServerClient();
  if (!db) return false;
  try {
    const bot = await findBotById(db, botId);
    return Boolean(bot && bot.user_id === userId);
  } catch {
    return false;
  }
}

export async function persistBacktestResultToD1(result: BacktestResult): Promise<void> {
  const db = createServerClient();
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO backtest_results (id, bot_id, strategy, pair, exchange, start_date, end_date, total_trades, win_count, loss_count, win_rate, total_pnl, max_drawdown, sharpe_ratio, params_json, equity_curve_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        result.id, result.bot_id, result.strategy, result.pair, result.exchange,
        result.start_date, result.end_date, result.total_trades, result.win_count,
        result.loss_count, result.win_rate, result.total_pnl, result.max_drawdown,
        result.sharpe_ratio, result.params_json, JSON.stringify(result.equity_curve_json),
        result.created_at,
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
      { action: 'getBacktestResults' },
    );
    return [];
  }
}
