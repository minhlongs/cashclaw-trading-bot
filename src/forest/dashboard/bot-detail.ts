// Forest layer — Bot detail view & trade history
// Deep bot inspection for the detail page.

'use server';

import { getBotManager, isGridConfig, isMeanRevConfig } from '@/tree/bot';
import { BotInstance } from '@/tree/bot/bot-instance';
import { getBotCards, type BotCardData } from './bot-kpis';

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
    name: s.id,
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

export async function getTradeHistory(_botId: string, _limit = 20): Promise<TradeRow[]> {
  // TODO: wire to D1 trade_events table once telemetry persists trades
  // Returning empty for now — client shows empty state gracefully
  return [];
}

export async function getAllBots(): Promise<BotCardData[]> {
  return getBotCards();
}
