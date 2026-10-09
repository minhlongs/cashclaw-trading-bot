import type { TradeEvent, TradeEventType } from './types';
import type { Balance } from '../exchange/types';
import { createLogger } from '@/lib/logger';
import type { TelemetryWriterDeps, TelemetryWriterCallbacks, Listener } from './writer-types';
import { generateEventId } from './writer-helpers';
import { TelemetryEmitters } from './writer-emitters';
import { flushTelemetryBatch, type QueueItem } from './writer-flush';
import { persistSnapshot, type SnapshotConfig } from './writer-snapshot';

const log = createLogger('telemetry-writer');

export class TelemetryWriter {
  private queue: QueueItem[] = [];
  private listeners = new Set<Listener>();
  private flushing = false;

  constructor(private deps: TelemetryWriterDeps, private callbacks: TelemetryWriterCallbacks = {}) {}

  emit(botId: string, eventType: TradeEventType, details: Record<string, unknown> = {}): void {
    const event: TradeEvent = { id: generateEventId(), botId, eventType, details, timestamp: Date.now() };
    this.queue.push({ event, retries: 0 });
    this.listeners.forEach(fn => { try { fn(event); } catch (e) { log.warn('Listener error', { error: e instanceof Error ? e : new Error(String(e)) }); } });
    if (!this.flushing) { this.flushing = true; queueMicrotask(async () => { while (this.queue.length > 0) await flushTelemetryBatch(this.queue, this.deps, this.callbacks); this.flushing = false; }); }
  }

  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  async snapshot(b: string, cap: number, p: number, bal: Balance[], cfg: SnapshotConfig): Promise<void> { return persistSnapshot(this, this.deps, this.callbacks, b, cap, p, bal, cfg); }
  emitTick(b: string, p: number, pnl?: number): void { TelemetryEmitters.emitTick(this, b, p, pnl); }
  emitFill(b: string, o: string, s: string, p: number, q: number, pnl = 0): void { TelemetryEmitters.emitFill(this, b, o, s, p, q, pnl); }
  emitSignal(b: string, s: string, ind: Record<string, unknown>): void { TelemetryEmitters.emitSignal(this, b, s, ind); }
  emitError(b: string, e: string, ctx: string): void { TelemetryEmitters.emitError(this, b, e, ctx); }
  emitHalt(b: string, r: string): void { TelemetryEmitters.emitHalt(this, b, r); } emitResume(b: string): void { TelemetryEmitters.emitResume(this, b); }
  emitStart(b: string, c: Record<string, unknown>): void { TelemetryEmitters.emitStart(this, b, c); }
  emitStop(b: string, r?: string): void { TelemetryEmitters.emitStop(this, b, r); } emitPause(b: string): void { TelemetryEmitters.emitPause(this, b); }
  emitRebalance(b: string, o: number, n: number): void { TelemetryEmitters.emitRebalance(this, b, o, n); }
  emitExchangeHealth(b: string, h: Parameters<typeof TelemetryEmitters.emitExchangeHealth>[2]): void { TelemetryEmitters.emitExchangeHealth(this, b, h); }
  emitRateLimitUsage(b: string, ex: string, u: Parameters<typeof TelemetryEmitters.emitRateLimitUsage>[3]): void { TelemetryEmitters.emitRateLimitUsage(this, b, ex, u); }
}
