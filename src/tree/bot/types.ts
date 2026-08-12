// Bot Engine — Core Types
// State machine events, bot lifecycle, strategy configs

export type BotStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';
export type BotMode = 'paper' | 'live';
export type StrategyType = 'grid' | 'mean_reversion';

export type BotEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'TICK'; data: { price: number; timestamp: number } }
  | { type: 'ORDER_FILLED'; data: { orderId: string; side: 'buy' | 'sell'; price: number; quantity: number } }
  | { type: 'ERROR'; data: { error: Error } }
  | { type: 'KILLSWITCH'; data: { reason: string } };

export interface BaseBotConfig {
  symbol: string;
  exchange: string;
  mode: BotMode;
  capital: number;
  maxDrawdownPct: number;
  strategy: StrategyType;
}

export interface GridBotConfig extends BaseBotConfig {
  strategy: 'grid';
  gridSpacingPct: number;
  gridLevels: number;
  capitalPerLevelPct: number;
  takeProfitPct: number;
  stopLossPct: number;
  rebalanceOnFill: boolean;
}

export interface MeanRevBotConfig extends BaseBotConfig {
  strategy: 'mean_reversion';
  bbPeriod: number;
  bbStdDev: number;
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  volumeMultiplier: number;
  positionSizePct: number;
  cooldownMinutes: number;
}

export type BotConfig = GridBotConfig | MeanRevBotConfig;

export interface BotState {
  id: string;
  config: BotConfig;
  status: BotStatus;
  createdAt: number;
  updatedAt: number;
  totalPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  currentDrawdown: number;
  startedAt: number | null;
  stoppedAt: number | null;
  lastTickAt: number | null;
  lastOrderAt: number | null;
  error: string | null;
}

export interface BotTrade {
  id: string;
  botId: string;
  exchangeId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price: number;
  quantity: number;
  filled: number;
  fee: number;
  pnl: number;
  status: 'open' | 'filled' | 'cancelled' | 'rejected';
  timestamp: number;
  gridLevel?: number;
  indicatorValues?: Record<string, number>;
}

export interface GridLevel {
  level: number;
  side: 'buy' | 'sell';
  triggerPrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  quantity: number;
  status: 'pending' | 'open' | 'filled' | 'cancelled';
  orderId: string | null;
  // Mutable runtime fields (not in initial config)
  price?: number;
  /** Entry fill price when this level was hit */
  filledPrice?: number;
  filledQty?: number;
  /** Trailing TP that ratchets up (buy) or down (sell) as price moves favorably */
  currentTpPrice?: number;
  /** Trailing SL that ratchets up (buy) or down (sell) as price moves favorably */
  currentSlPrice?: number;
  /** True once trailing has been initialized at entry fill */
  trailingActive?: boolean;
  /** Skip exit check for one tick — prevents same-tick close right after init */
  trailingSkipExit?: boolean;
}

export interface BotAuditLog {
  id: number;
  botId: string;
  event: string;
  details: Record<string, unknown>;
  timestamp: number;
}

export function isGridConfig(config: BotConfig): config is GridBotConfig {
  return config.strategy === 'grid';
}

export function isMeanRevConfig(config: BotConfig): config is MeanRevBotConfig {
  return config.strategy === 'mean_reversion';
}
