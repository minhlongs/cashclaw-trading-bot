// Forest layer — Bot detail view & trade history
// Deep bot inspection for the detail page.

'use server';

import { getBotManager, isGridConfig, isMeanRevConfig } from '@/tree/bot';
import { BotInstance } from '@/tree/bot/bot-instance';
import { getBotCards, type BotCardData } from './bot-kpis';
import { createServerClient } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';

// ── Types ───────────────────────────────────────────────────────
export interface BotDetailData {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  botStatus: string;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  capitalAllocated: number;
  capitalUsed: number;
  maxDrawdownPct: number;
  startedAt: number | null;
  updatedAt: number;
  config: Record<string, number>;
}

export interface TradeRow {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  pnl: number | null;
  status: 'open' | 'filled' | 'cancelled' | 'failed';
  openedAt: number;
}

// ── Helpers ─────────────────────────────────────────────────────
function botToDetail(bot: BotInstance): BotDetailData {
  const s = bot.getSnapshot();
  const cfg = bot.getConfig();

  const baseConfig: Record<string, number> = isGridConfig(cfg)
    ? {
        spacingPct: cfg.gridSpacingPct,
        levels: cfg.gridLevels,
        capitalPerLevelPct: cfg.capitalPerLevelPct,
        maxDrawdownPct: cfg.maxDrawdownPct,
      }
    : {
        bbPeriod: cfg.bbPeriod,
        bbStdDev: cfg.bbStdDev,
        rsiPeriod: cfg.rsiPeriod,
        rsiBuyThreshold: cfg.rsiBuyThreshold,
        rsiSellThreshold: cfg.rsiSellThreshold,
        volumeMultiplier: cfg.volumeMultiplier,
        positionSizePct: cfg.positionSizePct,
        maxDrawdownPct: cfg.maxDrawdownPct,
      };

  return {
    id: s.id,
    name: cfg.name || s.id,
    strategy: cfg.strategy,
    pair: cfg.symbol,
    exchange: cfg.exchange ?? 'paper',
    botStatus: s.status,
    totalPnl: s.totalPnl,
    winCount: s.winCount,
    lossCount: s.lossCount,
    capitalAllocated: cfg.capital,
    capitalUsed: Math.round(cfg.capital * 0.49),
    maxDrawdownPct: s.maxDrawdown,
    startedAt: s.startedAt,
    updatedAt: s.updatedAt,
    config: baseConfig,
  };
}

// ── Server Actions ──────────────────────────────────────────────
export async function getBotDetail(id: string): Promise<BotDetailData | null> {
  const manager = getBotManager();
  const bot = manager.getBot(id);
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
        pnl: details.pnl != null ? Number(details.pnl) : null,
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
