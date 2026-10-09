import type { TradeEvent } from '@/tree/telemetry';
import type { BotConfig } from '@/tree/bot';

export interface BotDetail {
  id: string; name: string; strategy: string; pair: string; exchange: string; status: string;
  capital: number; totalPnl: number; totalTrades: number; winCount: number; lossCount: number;
  maxDrawdown: number; currentDrawdown: number; startedAt: number | null; stoppedAt: number | null;
  lastTickAt: number | null; lastOrderAt: number | null; error: string | null;
  gridConfig?: Record<string, unknown>; recentEvents?: TradeEvent[];
}

export type BotControlAction = 'start' | 'stop' | 'pause' | 'resume';

export function extractGridConfig(config: BotConfig): Record<string, unknown> | undefined {
  if (config.strategy !== 'grid') return undefined;
  const grid = config as unknown as Record<string, unknown>;
  return {
    gridSpacingPct: grid.gridSpacingPct,
    gridLevels: grid.gridLevels,
    capitalPerLevelPct: grid.capitalPerLevelPct,
    takeProfitPct: grid.takeProfitPct,
    stopLossPct: grid.stopLossPct,
    rebalanceOnFill: grid.rebalanceOnFill,
  };
}
