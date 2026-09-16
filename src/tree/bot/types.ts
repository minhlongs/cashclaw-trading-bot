// Bot Engine — Core Types
// Re-export strategy-chain & config types; define lifecycle/state machine contracts

export * from './strategy-chain-types';
export * from './config-types';

import type { ExchangeAdapter } from '../exchange/types';
import type { Killswitch } from './killswitch';
import type { TelemetryWriter } from '../telemetry/writer';
import type { ExchangeOrchestrator } from '@/land/exchange-orchestration';
import type { BotConfig } from './config-types';

export type BotStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export type BotEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'TICK'; data: { price: number; timestamp: number } }
  | { type: 'ORDER_FILLED'; data: { orderId: string; side: 'buy' | 'sell'; price: number; quantity: number } }
  | { type: 'ERROR'; data: { error: Error } }
  | { type: 'KILLSWITCH'; data: { reason: string } };

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

export interface BotAuditLog {
  id: number;
  botId: string;
  event: string;
  details: Record<string, unknown>;
  timestamp: number;
}

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
  exchangeOrchestrator?: ExchangeOrchestrator;
}
