// Forest layer — Bot KPI calculations & dashboard data
// Pure computations over bot snapshots; no DB access except for initial hydration.

'use server';

import { getBotManager, type BotConfig } from '@/tree/bot';
import { BotInstance } from '@/tree/bot/bot-instance';
import { loadAllBotsFromD1 } from '@/forest/bot/d1-adapter';
import type { TradeEvent } from '@/tree/telemetry';
import { createLogger } from '@/lib/logger';
import { getRecentEvents } from './trade-events';

const log = createLogger('dashboard-actions');

// ── Types ───────────────────────────────────────────────────────
export interface BotCardData {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
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
function snapshotToCard(bot: BotInstance): BotCardData {
  const s = bot.getSnapshot();
  const cfg = bot.getConfig() as BotConfig;
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
    startedAt: s.startedAt,
    updatedAt: s.updatedAt,
    capitalAllocated: cfg.capital,
    maxDrawdownPct: s.maxDrawdown,
  };
}

function calcKpis(bots: BotInstance[]): DashboardKpis {
  const now = Date.now();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  let totalBalance = 0;
  let todayPnl = 0;
  let activeBots = 0;
  let totalTrades = 0;
  let winCountSum = 0;

  for (const bot of bots) {
    const s = bot.getSnapshot();
    const cfg = bot.getConfig() as BotConfig;
    totalBalance += cfg.capital + s.totalPnl;

    if (s.startedAt && s.startedAt >= startOfDay.getTime()) {
      todayPnl += s.totalPnl;
    }

    if (s.status === 'running') activeBots++;
    totalTrades += s.totalTrades;
    winCountSum += s.winCount;
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
  await loadAllBotsFromD1();
  const manager = getBotManager();
  const bots = manager.getAllBots();
  const kpis = calcKpis(bots);
  const botCards = bots.map(snapshotToCard);

  const recentEvents = await getRecentEvents(bots.map((b) => b.getSnapshot().id));
  return { kpis, bots: botCards, recentEvents };
}

export async function getKpis(): Promise<DashboardKpis> {
  const manager = getBotManager();
  return calcKpis(manager.getAllBots());
}

export async function getBotCards(): Promise<BotCardData[]> {
  await loadAllBotsFromD1();
  const manager = getBotManager();
  return manager.getAllBots().map(snapshotToCard);
}
