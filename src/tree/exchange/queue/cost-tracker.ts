// Cost Tracker — per-exchange daily API cost tracking
// Tracks cost units consumed per exchange, resets at midnight UTC.

import type { ExchangeId } from '../types';

export interface CostTrackerConfig {
  /** Daily cost budget per exchange */
  budget: Record<ExchangeId, number>;
  /** Optional: function to get current time (for testing) */
  getNow?: () => number;
}

interface DayBucket {
  date: string; // YYYY-MM-DD
  used: number;
}

export class CostTracker {
  private config: CostTrackerConfig;
  private buckets = new Map<ExchangeId, DayBucket>();

  constructor(config: CostTrackerConfig) {
    this.config = config;
  }

  /** Record cost units consumed for an exchange */
  record(exchange: ExchangeId, cost: number): void {
    const bucket = this.ensureBucket(exchange);
    bucket.used += cost;
  }

  /** Get remaining budget for an exchange today */
  getRemaining(exchange: ExchangeId): number {
    const budget = this.config.budget[exchange] ?? 0;
    const bucket = this.ensureBucket(exchange);
    return Math.max(0, budget - bucket.used);
  }

  /** Get total budget for an exchange */
  getBudget(exchange: ExchangeId): number {
    return this.config.budget[exchange] ?? 0;
  }

  /** Get cost used today for an exchange */
  getUsed(exchange: ExchangeId): number {
    return this.ensureBucket(exchange).used;
  }

  /** Whether this exchange is over its daily budget */
  isOverBudget(exchange: ExchangeId): boolean {
    return this.getRemaining(exchange) <= 0;
  }

  /** Get all exchange usage as a snapshot (for dashboard/telemetry) */
  snapshot(): Record<ExchangeId, { budget: number; used: number; remaining: number }> {
    const now = this.now();
    const today = this.dateKey(now);
    const result = {} as Record<ExchangeId, { budget: number; used: number; remaining: number }>;

    for (const exchange of ['binance', 'bybit', 'okx'] as ExchangeId[]) {
      const bucket = this.buckets.get(exchange);
      const used = bucket?.date === today ? bucket.used : 0;
      const budget = this.config.budget[exchange] ?? 0;
      result[exchange] = { budget, used, remaining: Math.max(0, budget - used) };
    }

    return result;
  }

  /** Reset all buckets (used by daily cron or tests) */
  reset(): void {
    this.buckets.clear();
  }

  // ── Internal ──────────────────────────────────────────────────

  private ensureBucket(exchange: ExchangeId): DayBucket {
    const now = this.now();
    const today = this.dateKey(now);
    const existing = this.buckets.get(exchange);

    if (existing && existing.date === today) {
      return existing;
    }

    // New day — start fresh
    const fresh: DayBucket = { date: today, used: 0 };
    this.buckets.set(exchange, fresh);
    return fresh;
  }

  private now(): number {
    return this.config.getNow ? this.config.getNow() : Date.now();
  }

  private dateKey(timestamp: number): string {
    return new Date(timestamp).toISOString().slice(0, 10); // YYYY-MM-DD
  }
}
