/**
 * D1 Persistence - Trades, telemetry events, snapshots & audit logs.
 */

import { createServerClient } from '@/lib/db/client';
import type { Trade, TradeEvent } from '@/lib/db/types';
import {
  insertTrade,
  insertTradeEvent,
  insertCapitalSnapshot,
  insertAudit,
} from '@/lib/db/repositories';
import { uid, now } from './d1-persistence-utils';

/** Persist a trade fill to D1. */
export async function persistTrade(botId: string, trade: {
  side: 'buy' | 'sell'; entryPrice: number; exitPrice?: number;
  quantity: number; pnl?: number; status: Trade['status'];
  exchangeOrderId?: string;
}): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  const row: Omit<Trade, 'created_at'> = {
    id: `trade_${uid()}`,
    bot_id: botId,
    pair: '',
    side: trade.side,
    entry_price: trade.entryPrice,
    exit_price: trade.exitPrice ?? null,
    quantity: trade.quantity,
    pnl: trade.pnl ?? null,
    fee: 0,
    status: trade.status,
    exchange_order_id: trade.exchangeOrderId ?? null,
    error_message: null,
    opened_at: now(),
    closed_at: trade.exitPrice !== undefined ? now() : null,
  };

  await insertTrade(db, row as Trade);
}

/** Write telemetry event. */
export async function persistEvent(
  botId: string,
  eventType: TradeEvent['event_type'],
  detail: Record<string, unknown> = {},
): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  await insertTradeEvent(db, {
    id: `evt_${uid()}`,
    bot_id: botId,
    event_type: eventType,
    detail_json: JSON.stringify(detail),
    created_at: now(),
  });
}

/** Write capital snapshot. */
export async function persistSnapshot(botId: string, snap: {
  totalCapital: number; realizedPnl: number; unrealizedPnl?: number;
  maxDrawdownPct: number; winCount: number; lossCount: number; totalTrades: number;
}): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  await insertCapitalSnapshot(db, {
    id: `snap_${uid()}`,
    bot_id: botId,
    total_capital: snap.totalCapital,
    realized_pnl: snap.realizedPnl,
    unrealized_pnl: snap.unrealizedPnl ?? 0,
    max_drawdown_pct: snap.maxDrawdownPct,
    win_count: snap.winCount,
    loss_count: snap.lossCount,
    total_trades: snap.totalTrades,
    created_at: now(),
  });
}

/** Write audit log entry. */
export async function persistAudit(
  userId: string | null,
  botId: string | null,
  action: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const db = createServerClient();
  if (!db) return;

  await insertAudit(db, {
    id: `audit_${uid()}`,
    user_id: userId,
    bot_id: botId,
    action,
    detail_json: JSON.stringify(detail),
    created_at: now(),
  });
}
