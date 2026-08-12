// Forest layer — Server Actions for dashboard data
// Bridges tree bot/runtime state to client-consumable shapes.

'use server';

import { getBotManager, type BotConfig, isGridConfig, isMeanRevConfig } from '@/tree/bot';
import { BotInstance } from '@/tree/bot/bot-instance';
import { createServerClient } from '@/lib/db/client';
import type { TradeEvent, CapitalSnapshot, TradeEventType } from '@/tree/telemetry';

const MAX_EVENTS = 200;
const MAX_SNAPSHOTS = 90;

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

function snapshotToCard(bot: BotInstance): BotCardData {
  const s = bot.getSnapshot();
  const cfg = bot.getConfig() as BotConfig;
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

export async function getDashboardData(): Promise<DashboardData> {
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
  const manager = getBotManager();
  return manager.getAllBots().map(snapshotToCard);
}

interface EventRow {
  id: string;
  bot_id: string;
  event_type: string;
  detail_json: string;
  created_at: number;
}

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
        } catch {
          // malformed JSON — skip details
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
  } catch {
    return [];
  }
}

interface SnapshotRow {
  id: string;
  bot_id: string;
  total_capital: number;
  realized_pnl: number;
  unrealized_pnl: number;
  max_drawdown_pct: number;
  win_count: number;
  loss_count: number;
  total_trades: number;
  created_at: number;
}

export async function getCapitalSnapshots(botId: string, limit = 30): Promise<CapitalSnapshot[]> {
  const db = createServerClient();
  if (!db) return [];

  try {
    const { results } = await db
      .prepare(
        `SELECT id, bot_id, total_capital, realized_pnl, unrealized_pnl,
                max_drawdown_pct, win_count, loss_count, total_trades, created_at
         FROM capital_snapshots
         WHERE bot_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(botId, Math.min(limit, MAX_SNAPSHOTS))
      .all<SnapshotRow>();

    return results.map((r) => ({
      id: r.id,
      botId: r.bot_id,
      totalCapital: r.total_capital,
      realizedPnl: r.realized_pnl,
      unrealizedPnl: r.unrealized_pnl,
      maxDrawdownPct: r.max_drawdown_pct,
      winCount: r.win_count,
      lossCount: r.loss_count,
      totalTrades: r.total_trades,
      timestamp: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function botActionStart(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(id);
    if (!bot) return { ok: false, error: 'Bot not found in memory' };
    await bot.start();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Start failed' };
  }
}

export async function botActionStop(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(id);
    if (!bot) return { ok: false, error: 'Bot not found in memory' };
    bot.stop();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Stop failed' };
  }
}

export async function botActionPause(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(id);
    if (!bot) return { ok: false, error: 'Bot not found in memory' };
    bot.pause();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Pause failed' };
  }
}

export async function botActionResume(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const manager = getBotManager();
    const bot = manager.getBot(id);
    if (!bot) return { ok: false, error: 'Bot not found in memory' };
    manager.resumeBot(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Resume failed' };
  }
}

export async function killswitchActionHalt(reason: string): Promise<{ ok: boolean }> {
  getBotManager().manualHalt(reason);
  return { ok: true };
}

export async function killswitchActionResume(): Promise<{ ok: boolean }> {
  getBotManager().manualResume();
  return { ok: true };
}

// ── Bot Detail Actions ────────────────────────────────────────

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
