// Killswitch types — shared interfaces for circuit breaker
import type { OrderResult } from '../exchange/types';

export interface KillswitchCallbacks {
  onHalt: (reason: string) => void;
  onResume: () => void;
  onOrderPlaced: (order: OrderResult) => void;
  onOrderFilled: (order: OrderResult) => void;
  onError: (error: Error, context: string) => void;
  onDailyStateChange?: (daily: { dailyPnl: number; consecutiveLosses: number; peakCapital: number; dailyStartTime: number }) => void;
}

export interface KillswitchConfig {
  maxDailyLossPct: number;
  maxConsecutiveLosses: number;
  maxDrawdownPct: number;
  cooldownMinutes: number;
}

export interface KillswitchState {
  enabled: boolean;
  halted: boolean;
  haltReason: string | null;
  haltTimestamp: number | null;
  dailyPnl: number;
  consecutiveLosses: number;
  peakCapital: number;
  currentDrawdown: number;
  cooldownUntil: number | null;
  dailyStartTime: number;
}
