import type { BotCardData } from '@/forest/dashboard/actions';

export interface StrategyGroup {
  strategy: string;
  allocated: number;
  pnl: number;
  winRate: number;
  totalBots: number;
  activeBots: number;
}

export const STRATEGY_ORDER = ['grid', 'mean_reversion', 'volatility_dca'];

export function getStrategyLabel(key: string, t: (k: string) => string): string {
  if (key === 'grid') return t('grid');
  if (key === 'mean_reversion') return t('meanReversion');
  if (key === 'volatility_dca') return t('volatilityDca');
  return key;
}

export function computeStrategyGroups(bots: BotCardData[]): {
  groups: StrategyGroup[];
  totalAllocated: number;
} {
  const groupMap = new Map<string, {
    allocated: number;
    pnl: number;
    wins: number;
    losses: number;
    totalBots: number;
    activeBots: number;
  }>();

  for (const bot of bots) {
    const key = bot.strategy || 'unknown';
    const curr = groupMap.get(key) ?? {
      allocated: 0, pnl: 0, wins: 0, losses: 0, totalBots: 0, activeBots: 0,
    };
    curr.allocated += Number.isFinite(bot.capitalAllocated) ? bot.capitalAllocated : 0;
    curr.pnl += Number.isFinite(bot.totalPnl) ? bot.totalPnl : 0;
    curr.wins += Number.isFinite(bot.winCount) ? bot.winCount : 0;
    curr.losses += Number.isFinite(bot.lossCount) ? bot.lossCount : 0;
    curr.totalBots += 1;
    if (bot.botStatus === 'running' || bot.botStatus === 'active') curr.activeBots += 1;
    groupMap.set(key, curr);
  }

  const totalAllocated = bots.reduce(
    (sum, b) => sum + (Number.isFinite(b.capitalAllocated) ? b.capitalAllocated : 0),
    0
  );

  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
    const idxA = STRATEGY_ORDER.indexOf(a);
    const idxB = STRATEGY_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const groups: StrategyGroup[] = sortedKeys.map((key) => {
    const data = groupMap.get(key)!;
    const trades = data.wins + data.losses;
    return {
      strategy: key,
      allocated: data.allocated,
      pnl: data.pnl,
      winRate: trades > 0 ? Math.round((data.wins / trades) * 100) : 0,
      totalBots: data.totalBots,
      activeBots: data.activeBots,
    };
  });

  return { groups, totalAllocated };
}
