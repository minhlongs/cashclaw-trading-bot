// Bot Management — types and status mapper
// Extracted from index.ts for size compliance.

import type { BotState, BotConfig } from '@/tree/bot/types';

export interface BotInfo {
  id: string;
  name: string;
  strategy: string;
  pair: string;
  exchange: string;
  status: string;
  capital: number;
  totalPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  startedAt: number | null;
  stoppedAt: number | null;
  lastTickAt: number | null;
  lastOrderAt: number | null;
  error: string | null;
}

export interface BotCreateInput {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  capital: number;
  mode: 'paper' | 'live';
  config: Record<string, unknown>;
}

export interface BotListResult {
  bots: BotInfo[];
  total: number;
}
