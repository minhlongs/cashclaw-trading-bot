// Forest layer — Bot KPI calculations & dashboard data
// Reads bot data directly from D1 via BotQueryService.

'use server';

import { BotQueryService, type BotSummary } from '@/forest/bot/d1-adapter';
import type { TradeEvent } from '@/tree/telemetry';
import { getRecentEvents } from './trade-events';

// ── Types ───────────────────────────────────────────────────────
export interface BotCardData {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion' | 'volatility_dca' | string;
  pair: string;
  exchange: string;
  botStatus: string;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  startedAt: number | null;
  updatedAt: number;
  capitalAllocated: number;
  maxDrawdownPct: number;
}

export interface DashboardKpis {
  totalBalance: number;
  todayPnl: number;
  activeBots: number;
  totalTrades: number;
  winRate: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  bots: BotCardData[];
  recentEvents: TradeEvent[];
}

// ── Helpers ─────────────────────────────────────────────────────
function botToCard(bot: BotSummary): BotCardData {
  return {
    id: bot.id,
    name: bot.name || bot.id,
    strategy: bot.strategy as 'grid' | 'mean_reversion',
    pair: bot.pair,
    exchange: bot.config.exchange ?? bot.exchange ?? 'paper',
    botStatus: bot.status,
    totalPnl: bot.metrics.totalPnl,
    winCount: bot.metrics.winCount,
    lossCount: bot.metrics.lossCount,
    startedAt: bot.metrics.startedAt,
    updatedAt: bot.updatedAt,
    capitalAllocated: bot.config.capital,
    maxDrawdownPct: bot.metrics.maxDrawdown,
  };
}

function calcKpis(bots: BotSummary[]): DashboardKpis {
  const now = Date.now();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  let totalBalance = 0;
  let todayPnl = 0;
  let activeBots = 0;
  let totalTrades = 0;
  let winCountSum = 0;

  for (const bot of bots) {
    totalBalance += bot.config.capital + bot.metrics.totalPnl;

    if (bot.metrics.startedAt && bot.metrics.startedAt >= startOfDay.getTime()) {
      todayPnl += bot.metrics.totalPnl;
    }

    if (bot.status === 'running') activeBots++;
    totalTrades += bot.metrics.totalTrades;
    winCountSum += bot.metrics.winCount;
  }

  return {
    totalBalance,
    todayPnl,
    activeBots,
    totalTrades,
    winRate: totalTrades > 0 ? Math.round((winCountSum / totalTrades) * 100) : 0,
  };
}

// ── Server Actions ──────────────────────────────────────────────
export async function getDashboardData(): Promise<DashboardData> {
  const service = new BotQueryService();
  const bots = await service.listBots();
  const kpis = calcKpis(bots);
  const botCards = bots.map(botToCard);

  const recentEvents = await getRecentEvents(bots.map((b) => b.id));
  return { kpis, bots: botCards, recentEvents };
}

export async function getKpis(): Promise<DashboardKpis> {
  const service = new BotQueryService();
  const bots = await service.listBots();
  return calcKpis(bots);
}

export async function getBotCards(): Promise<BotCardData[]> {
  const service = new BotQueryService();
  const bots = await service.listBots();
  return bots.map(botToCard);
}
