// Row types + response type for daily-stats query results.

export interface SnapshotRow {
  bot_id: string;
  total_capital: number;
  realized_pnl: number;
  max_drawdown_pct: number;
}

export interface EventRow {
  id: string;
  bot_id: string;
  event_type: string;
  detail_json: string | null;
  created_at: number;
}

export interface DailyStats {
  ok: boolean;
  data?: {
    date: string;
    activeBots: number;
    totalTrades: number;
    totalPnl: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    byStrategy: Record<string, { trades: number; pnl: number }>;
  };
  error?: string;
}
