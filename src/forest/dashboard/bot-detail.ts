// Forest layer — Bot detail view & trade history
// Deep bot inspection for the detail page.

'use server';

import { getBotCards, type BotCardData } from './bot-kpis';
import { BotQueryService } from '@/forest/bot/d1-adapter';
import { createServerClient } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import type { BotDetailData, TradeRow } from './bot-detail-types';
import { botToDetail } from './bot-detail-mapper';

export type { BotDetailData, TradeRow };
export { botToDetail };

export async function getBotDetail(id: string): Promise<BotDetailData | null> {
  const service = new BotQueryService();
  const bot = await service.getBot(id);
  if (!bot) return null;
  return botToDetail(bot);
}

export async function getTradeHistory(botId: string, limit = 20): Promise<TradeRow[]> {
  const log = createLogger('bot-detail');
  const db = createServerClient();
  if (!db) return [];

  try {
    const result = await db
      .prepare('SELECT id, detail_json, created_at FROM trade_events WHERE bot_id = ? AND event_type = ? ORDER BY created_at DESC LIMIT ?')
      .bind(botId, 'fill', limit)
      .all<{ id: string; detail_json: string; created_at: number }>();

    return result.results.map((row) => {
      let details: Record<string, unknown> = {};
      try {
        details = JSON.parse(row.detail_json);
      } catch {
        log.warn('Malformed trade event detail_json', { action: 'getTradeHistory', eventId: row.id });
      }
      return {
        id: row.id,
        side: (details.side as 'buy' | 'sell') ?? 'buy',
        price: Number(details.price) || 0,
        quantity: Number(details.quantity) || 0,
        pnl: details.pnl !== null && details.pnl !== undefined ? Number(details.pnl) : null,
        status: 'filled' as const,
        openedAt: row.created_at,
      };
    });
  } catch (error) {
    log.error('Failed to fetch trade history', error instanceof Error ? error : new Error(String(error)), { action: 'getTradeHistory', botId });
    return [];
  }
}

export async function getAllBots(): Promise<BotCardData[]> {
  return getBotCards();
}
