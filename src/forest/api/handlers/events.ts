/**
 * GET /api/events handler
 * Returns recent trade events from D1.
 *
 * Query params:
 *   botId  — optional filter (single bot)
 *   limit  — max rows (default 50, cap 200)
 */

import { createServerClient } from '@/lib/db/client';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- TradeEvent used on line ~48; TradeEventType cast on line 91
import type { TradeEvent, TradeEventType } from '@/tree/telemetry';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/events');

export interface EventsResponse {
  ok: boolean;
  data?: TradeEvent[];
  error?: string;
}

const MAX_LIMIT = 200;

export async function eventsHandler(
  botId?: string,
  limit = 50,
): Promise<EventsResponse> {
  const db = createServerClient();
  if (!db) {
    return { ok: false, error: 'Database not available' };
  }

  const cappedLimit = Math.min(limit, MAX_LIMIT);

  try {
    if (botId) {
      const { results } = await db
        .prepare(
          `SELECT id, bot_id, event_type, detail_json, created_at
           FROM trade_events
           WHERE bot_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .bind(botId, cappedLimit)
        .all<EventRow>();

      return { ok: true, data: rowsToEvents(results) };
    }

    const { results } = await db
      .prepare(
        `SELECT id, bot_id, event_type, detail_json, created_at
         FROM trade_events
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(cappedLimit)
      .all<EventRow>();

    return { ok: true, data: rowsToEvents(results) };
  } catch (error) {
    log.error('Failed to query events', error instanceof Error ? error : new Error(String(error)), { action: 'eventsHandler' });
    return { ok: false, error: 'Failed to query events' };
  }
}

interface EventRow {
  id: string;
  bot_id: string;
  event_type: string;
  detail_json: string | null;
  created_at: number;
}

function rowsToEvents(rows: EventRow[]): TradeEvent[] {
  const out: TradeEvent[] = [];
  for (const r of rows) {
    let details: Record<string, unknown> = {};
    if (r.detail_json) {
      try {
        details = JSON.parse(r.detail_json) as Record<string, unknown>;
      } catch (error) {
        // malformed JSON — keep empty details but log
        log.warn('Malformed trade event detail JSON', { action: 'rowsToEvents', error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
    out.push({
      id: r.id,
      botId: r.bot_id,
      eventType: r.event_type as TradeEventType,
      details,
      timestamp: r.created_at,
    });
  }
  return out;
}
