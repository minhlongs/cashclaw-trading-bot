// Bot scheduler type definitions.

import type { ExchangeOrchestrator } from '@/land/exchange-orchestration';

/** Scheduler dependency injection surface (test seam). */
export interface SchedulerDeps {
  getNow?: () => number; // override for testing
  onEvalError?: (botId: string, error: Error) => void;
  /** Optional: return the ExchangeOrchestrator for circuit-open checks before tick */
  getOrchestrator?: () => ExchangeOrchestrator;
}

export interface SchedulerTickReport {
  tickCount: number;
  botsEvaluated: number;
  halted: boolean;
  errors: SchedulerError[];
  rateLimitUsage: Record<string, number>;
}

export interface SchedulerError {
  botId: string;
  message: string;
}
