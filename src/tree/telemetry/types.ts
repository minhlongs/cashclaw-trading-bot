// Telemetry — Event + Snapshot types for trade telemetry pipeline

export type TradeEventType =
  | 'tick'
  | 'fill'
  | 'signal'
  | 'error'
  | 'halt'
  | 'resume'
  | 'start'
  | 'stop'
  | 'pause'
  | 'config_change'
  | 'rebalance'
  | 'metric_snapshot'
  | 'exchange_health'
  | 'rate_limit_usage';

export interface TradeEvent {
  id: string;
  botId: string;
  eventType: TradeEventType;
  details: Record<string, unknown>;
  timestamp: number;
}

export interface CapitalSnapshot {
  id: string;
  botId: string;
  totalCapital: number;
  realizedPnl: number;
  unrealizedPnl: number;
  maxDrawdownPct: number;
  winCount: number;
  lossCount: number;
  totalTrades: number;
  timestamp: number;
}

export interface DailyMetrics {
  botId: string;
  date: string;              // YYYY-MM-DD
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalPnl: number;
  avgPnlPerTrade: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  profitFactor: number | null;
}

export interface ExchangeHealthSnapshot {
  exchangeId: string;
  score: number;
  state: string;
  latencyMs: number;
  failureCount: number;
  rateLimitUsed: number;
  rateLimitTotal: number;
  timestamp: number;
}

export interface GoLiveReadiness {
  botId: string;
  paperDays: number;
  totalTrades: number;
  winRate: number;
  sharpeRatio: number | null;
  maxDrawdownPct: number;
  consecutiveLosses: number;
  ready: boolean;
  blockers: string[];
}
