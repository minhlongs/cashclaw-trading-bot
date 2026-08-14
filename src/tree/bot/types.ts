// Bot Engine — Core Types
// State machine events, bot lifecycle, strategy configs

import type { ExchangeAdapter } from '../exchange/types';
import type { Killswitch } from './killswitch';
import type { TelemetryWriter } from '../telemetry/writer';

// ── StrategyChain (OmniRoute Phase 4) ────────────────────────────────────────
export interface StrategyContext {
  symbol: string;
  balance: number;
  openPositions: number;
  lastPrice: number;
}

export interface TradeSignal {
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  reason: string;
}

export interface ChainLeg {
  strategy: 'grid' | 'mean_reversion';
  on: string;
}

export interface ChainStrategy {
  name: string;
  evaluate(ctx: StrategyContext): TradeSignal | null;
}

export interface ChainNode {
  strategy: ChainStrategy;
  fallback: ChainStrategy | null;
}

export type StrategyChain = ChainNode[];

export interface PreconditionResult {
  pass: boolean;
  reason: string;
}

export type PreconditionFn = (ctx: StrategyContext) => PreconditionResult;

export function hasStrategyChain(
  config: BotConfig,
): config is BotConfig & { strategyChain: ChainLeg[] } {
  return Array.isArray(config.strategyChain) &&
    config.strategyChain.length > 0;
}

// ── Existing bot configs ─────────────────────────────────────────────────────
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
  strategyChain?: ChainLeg[];
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
  startedAt: number | null;
  error: string | null;
  totalPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  currentDrawdown: number;
  stoppedAt: number | null;
  lastTickAt: number | null;
  lastOrderAt: number | null;
  updatedAt: number;
}

export interface BotTrade {
  id: string;
  botId: string;
  exchangeId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  price: number;
  quantity: number;
  filled: number;
  fee: number;
  pnl: number;
  status: 'pending' | 'filled' | 'cancelled';
  timestamp: number;
}

export type GridLevelStatus = 'pending' | 'open' | 'filled' | 'cancelled';

export interface GridLevel {
  level: number;
  side: 'buy' | 'sell';
  triggerPrice: number;
  quantity: number;
  status: GridLevelStatus;
  price?: number;
  filledPrice?: number | null;
  takeProfitPrice: number;
  stopLossPrice: number;
  currentTpPrice?: number;
  currentSlPrice?: number;
  trailingActive?: boolean;
  trailingSkipExit?: boolean;
  orderId: string | null;
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

// ── Bot instance types (extracted from bot-instance.ts) ─────────────────────

export interface BotCallbacks {
  onStateChange: (state: BotState) => void;
  onTrade: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
  onError: (error: Error, context: string) => void;
}

export interface BotDependencies {
  exchange: ExchangeAdapter;
  killswitch: Killswitch;
  telemetry?: TelemetryWriter;
}
