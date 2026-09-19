// Telemetry Writer — D1 SQL statements + row-binding helpers
import type { TradeEvent } from './types';
import { serializeDetail } from '@/forest/api/handlers/serialize-detail';

export const INSERT_TRADE_EVENT_SQL = `INSERT INTO trade_events (id, bot_id, event_type, detail_json, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO NOTHING`;

export const INSERT_CAPITAL_SNAPSHOT_SQL = `INSERT INTO capital_snapshots (id, bot_id, total_capital, realized_pnl, unrealized_pnl, max_drawdown_pct, win_count, loss_count, total_trades, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO NOTHING`;

export function buildEventInsertParams(event: TradeEvent): unknown[] {
  return [event.id, event.botId, event.eventType, serializeDetail(event.details), event.timestamp];
}

export function buildSnapshotInsertParams(
  id: string,
  botId: string,
  capital: number,
  pnl: number,
  maxDD: number,
  config: { winCount: number; lossCount: number; totalTrades: number },
  now: number
): unknown[] {
  return [id, botId, capital, pnl, 0, maxDD, config.winCount, config.lossCount, config.totalTrades, now];
}
