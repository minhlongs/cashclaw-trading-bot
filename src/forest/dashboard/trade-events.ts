// Forest layer — Trade event queries from D1
// Fetches recent trade events for dashboard display.

'use server';

import { getBotManager } from '@/tree/bot';
import { createServerClient } from '@/lib/db/client';
import type { TradeEvent, TradeEventType } from '@/tree/telemetry';
import { createLogger } from '@/lib/logger';

const log = createLogger('dashboard-actions');
const MAX_EVENTS = 200;

// ── Internal types ──────────────────────────────────────────────
interface EventRow {
  id: string;
  bot_id: string;
  event_type: string;
  detail_json: string;
  created_at: number;
}

// ── Server Actions ──────────────────────────────────────────────
export async function getRecentEvents(botIds?: string[]): Promise<TradeEvent[]> {
  const db = createServerClient();
  if (!db) return [];

  const ids = botIds ?? getBotManager().getAllBots().map((b) => b.getSnapshot().id);
  if (ids.length === 0) return [];

  try {
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await db
      .prepare(
        `SELECT id, bot_id, event_type, detail_json, created_at
         FROM trade_events
         WHERE bot_id IN (${placeholders})
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(...ids, Math.min(MAX_EVENTS, 200))
      .all<EventRow>();

    const out: TradeEvent[] = [];
    for (const r of results) {
      let details: Record<string, unknown> = {};
      if (r.detail_json) {
        try {
          details = JSON.parse(r.detail_json) as Record<string, unknown>;
        } catch (error) {
          log.warn('Malformed trade event JSON skipped', { action: 'parseEventDetail', error: error instanceof Error ? error : new Error(String(error)) });
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
  } catch (error) {
    log.error('Failed to fetch trade events', error instanceof Error ? error : new Error(String(error)), { action: 'getTradeEvents' });
    return [];
  }
}
