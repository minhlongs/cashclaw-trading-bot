/**
 * Bot Query Service — Type Definitions
 * Shared interfaces for the direct-D1 read store.
 */

import type { BotConfig, BotStatus } from '@/tree/bot/types';

export interface BotSummary {
  id: string;
  name: string;
  status: BotStatus;
  pair: string;
  strategy: string;
  exchange: string;
  mode: 'paper' | 'live';
  config: BotConfig;
  metrics: BotMetrics;
  createdAt: number;
  updatedAt: number;
}

export interface BotMetrics {
  totalPnl: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  currentDrawdown: number;
  totalTrades: number;
  startedAt: number | null;
  stoppedAt: number | null;
  lastTickAt: number | null;
  lastOrderAt: number | null;
  lastError: string | null;
}

export interface BotRow {
  id: string;
  user_id: string;
  name: string;
  config_json: string;
  status: string;
  total_pnl: number;
  win_count: number;
  loss_count: number;
  max_drawdown: number;
  current_drawdown: number;
  total_trades: number;
  started_at: number | null;
  stopped_at: number | null;
  last_tick_at: number | null;
  last_order_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}
