// Flight Recorder — Formatting helpers for D1 row objects

import type { BotRecord, FillRecord, TickRecord } from './flight-recorder-types';

export function formatBotRow(
  row: Record<string, unknown>
): BotRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    strategy: String(row.strategy),
    pair: String(row.pair),
    exchange: String(row.exchange),
    status: String(row.status),
    started_at: String(row.started_at),
    stopped_at: row.stopped_at !==null ? String(row.stopped_at) : null,
    created_at: String(row.created_at),
  };
}

export function formatFillRow(
  row: Record<string, unknown>
): FillRecord {
  return {
    id: String(row.id),
    bot_id: String(row.bot_id),
    pair: String(row.pair),
    side: String(row.side),
    entry_price: Number(row.entry_price),
    exit_price: Number(row.exit_price),
    quantity: Number(row.quantity),
    pnl: Number(row.pnl),
    fee: Number(row.fee),
    status: String(row.status),
    exchange_order_id: String(row.exchange_order_id),
    error_message: row.error_message !==null ? String(row.error_message) : null,
    opened_at: String(row.opened_at),
    closed_at: row.closed_at !==null ? String(row.closed_at) : null,
    created_at: String(row.created_at),
  };
}

export function formatTickRow(
  row: Record<string, unknown>
): TickRecord {
  return {
    id: String(row.id),
    bot_id: String(row.bot_id),
    event_type: String(row.event_type),
    data: String(row.data),
    created_at: String(row.created_at),
  };
}
