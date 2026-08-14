// Telemetry Writer — non-blocking async queue that persists trade events + snapshots to D1
// Wires into BotInstance / Killswitch callbacks. Drop-in: just call writer.emit().

import type { TradeEvent, TradeEventType } from './types';
import type { Balance } from '../exchange/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('telemetry-writer');

type Listener = (event: TradeEvent) => void | Promise<void>;

export interface TelemetryWriterDeps {
  enqueue: (sql: string, bindings: unknown[]) => Promise<unknown>;
}

export interface TelemetryWriterCallbacks {
  onFlushError?: (error: Error) => void;
}

export class TelemetryWriter {
  private deps: TelemetryWriterDeps;
  private callbacks: TelemetryWriterCallbacks;
  private listeners = new Set<Listener>();
  private queue: Array<{ event: TradeEvent; retries: number }> = [];
  private flushing = false;
  private readonly MAX_RETRIES = 3;

  constructor(deps: TelemetryWriterDeps, callbacks: TelemetryWriterCallbacks = {}) {
    this.deps = deps;
    this.callbacks = callbacks;
  }

  // ------------------------------------------------------------------
  // Public API — call these from strategy / bot / killswitch
  // ------------------------------------------------------------------

  emit(botId: string, eventType: TradeEventType, details: Record<string, unknown> = {}): void {
    const event: TradeEvent = {
      id: this.makeId(),
      botId,
      eventType,
      details,
      timestamp: Date.now(),
    };
    this.queue.push({ event, retries: 0 });
    this.listeners.forEach((fn) => {
      try { fn(event); } catch (error) { log.warn('Listener error', { error: error instanceof Error ? error : new Error(String(error)) }); }
    });
    this.flushSoon();
  }

  emitTick(botId: string, price: number, pnl?: number): void {
    this.emit(botId, 'tick', { price, pnl });
  }

  emitFill(botId: string, orderId: string, side: string, price: number, qty: number, pnl = 0): void {
    this.emit(botId, 'fill', { orderId, side, price, quantity: qty, pnl });
  }

  emitSignal(botId: string, signal: string, indicatorValues: Record<string, unknown>): void {
    this.emit(botId, 'signal', { signal, ...indicatorValues });
  }

  emitError(botId: string, error: string, context: string): void {
    this.emit(botId, 'error', { error, context });
  }

  emitHalt(botId: string, reason: string): void {
    this.emit(botId, 'halt', { reason });
  }

  emitResume(botId: string): void {
    this.emit(botId, 'resume', {});
  }

  emitStart(botId: string, config: Record<string, unknown>): void {
    this.emit(botId, 'start', { config });
  }

  emitStop(botId: string, reason?: string): void {
    this.emit(botId, 'stop', { reason: reason ?? 'normal' });
  }

  emitPause(botId: string): void {
    this.emit(botId, 'pause', {});
  }

  emitRebalance(botId: string, oldBase: number, newBase: number): void {
    this.emit(botId, 'rebalance', { oldBase, newBase });
  }

  // Persist a daily capital snapshot (call once per bot per day, OR after each fill)
  async snapshot(botId: string, capital: number, pnl: number, balances: Balance[], config: {
    maxDrawdownPct: number;
    winCount: number;
    lossCount: number;
    totalTrades: number;
  }): Promise<void> {
    const maxDD = config.maxDrawdownPct;
    const id = `snap_${botId}_${Date.now()}`;
    const now = Date.now();
    try {
      await this.deps.enqueue(
        `INSERT INTO capital_snapshots (id, bot_id, total_capital, realized_pnl, unrealized_pnl, max_drawdown_pct, win_count, loss_count, total_trades, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [id, botId, capital, pnl, 0, maxDD, config.winCount, config.lossCount, config.totalTrades, now]
      );
    } catch (e) {
      this.callbacks.onFlushError?.(e instanceof Error ? e : new Error(String(e)));
    }
    // Don't block on snapshot emit — also log as event
    this.emit(botId, 'metric_snapshot', {
      capital, pnl, maxDrawdownPct: maxDD,
      winCount: config.winCount, lossCount: config.lossCount, totalTrades: config.totalTrades,
    });
  }

  // ------------------------------------------------------------------
  // Internal — queue + flush
  // ------------------------------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private flushSoon(): void {
    if (!this.flushing) {
      this.flushing = true;
      queueMicrotask(() => this.flush());
    }
  }

  private async flush(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 50); // flush 50 at a time
      for (const { event } of batch) {
        try {
          await this.deps.enqueue(
            `INSERT INTO trade_events (id, bot_id, event_type, detail_json, created_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`,
            [event.id, event.botId, event.eventType, JSON.stringify(event.details), event.timestamp]
          );
        } catch (e) {
          // Retry transient errors up to N times, then drop (telemetry is lossy-tolerable)
          const item = { event, retries: 1 };
          if ((e as Error).message?.includes('DESTINATION_ERR') || (e as Error).message?.includes('locked')) {
            if (item.retries < this.MAX_RETRIES) {
              this.queue.unshift(item);
            }
          }
          this.callbacks.onFlushError?.(e instanceof Error ? e : new Error(String(e)));
        }
      }
    }
    this.flushing = false;
  }

  private makeId(): string {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
