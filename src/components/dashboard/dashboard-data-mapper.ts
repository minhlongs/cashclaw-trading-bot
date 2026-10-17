import type { BotCardData } from '@/forest/dashboard/actions';
import type { DashboardKpis } from '@/forest/dashboard/bot-kpis';

export interface BotCardDataApi {
  readonly id: string;
  readonly name: string;
  readonly strategy: 'grid' | 'mean_reversion' | 'volatility_dca' | string;
  readonly pair: string;
  readonly exchange: string;
  readonly status: string;
  readonly totalPnl: number;
  readonly winCount: number;
  readonly lossCount: number;
  readonly startedAt: number | null;
  readonly updatedAt: number;
  readonly capitalAllocated: number;
}

export interface DashboardData {
  readonly kpis: DashboardKpis;
  readonly bots: BotCardData[];
}

export function mapBotsPayloadToDashboardData(items: readonly BotCardDataApi[]): DashboardData {
  const bots: BotCardData[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    strategy: item.strategy,
    pair: item.pair,
    exchange: item.exchange,
    botStatus: item.status,
    totalPnl: Number.isFinite(item.totalPnl) ? item.totalPnl : 0,
    winCount: Number.isFinite(item.winCount) ? item.winCount : 0,
    lossCount: Number.isFinite(item.lossCount) ? item.lossCount : 0,
    startedAt: item.startedAt ?? null,
    updatedAt: item.updatedAt,
    capitalAllocated: Number.isFinite(item.capitalAllocated) ? item.capitalAllocated : 0,
    maxDrawdownPct: 0,
  }));

  const totalWinCount = bots.reduce((sum, b) => sum + b.winCount, 0);
  const totalLossCount = bots.reduce((sum, b) => sum + b.lossCount, 0);
  const totalTrades = totalWinCount + totalLossCount;
  const kpis: DashboardKpis = {
    totalBalance: bots.reduce((sum, b) => sum + b.capitalAllocated + b.totalPnl, 0),
    todayPnl: bots.reduce((sum, b) => sum + b.totalPnl, 0),
    activeBots: bots.filter((b) => b.botStatus === 'running' || b.botStatus === 'active').length,
    totalTrades,
    winRate: totalTrades > 0 ? Math.round((totalWinCount / totalTrades) * 100) : 0,
  };

  return { kpis, bots };
}
