import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryWriter } from './writer';
import type { TradeEvent } from './types';
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
function mockDeps() { return { enqueue: vi.fn(async () => undefined) }; }
function mockCallbacks() { return { onFlushError: vi.fn((_e: Error) => {}) }; }
function getEvent(fn: ReturnType<typeof vi.fn>, i = 0): TradeEvent { return fn.mock.calls[i][0] as TradeEvent; }
let dateSpy: ReturnType<typeof vi.spyOn> | undefined;
beforeEach(() => { dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1000); });
afterEach(() => { dateSpy?.mockRestore(); vi.restoreAllMocks(); });
async function flush() { await new Promise<void>((r) => queueMicrotask(r)); await new Promise<void>((r) => setTimeout(r, 10)); }
describe('TelemetryWriter', () => {
  describe('constructor', () => {
    it('creates without callbacks', () => { expect(new TelemetryWriter(mockDeps())).toBeInstanceOf(TelemetryWriter); });
    it('creates with callbacks', () => { expect(new TelemetryWriter(mockDeps(), mockCallbacks())).toBeInstanceOf(TelemetryWriter); });
  });
  describe('subscribe / unsubscribe', () => {
    it('listener receives emitted events', () => {
      const w = new TelemetryWriter(mockDeps()); const fn = vi.fn();
      w.subscribe(fn); w.emit('b1', 'start', { x: 1 });
      expect(fn).toHaveBeenCalledOnce();
      expect(getEvent(fn).botId).toBe('b1');
      expect(getEvent(fn).eventType).toBe('start');
    });
    it('unsubscribed listener no longer fires', () => {
      const w = new TelemetryWriter(mockDeps()); const fn = vi.fn();
      const unsub = w.subscribe(fn); w.emit('b1', 'start');
      expect(fn).toHaveBeenCalledOnce(); unsub(); w.emit('b1', 'stop');
      expect(fn).toHaveBeenCalledOnce();
    });
    it('multiple listeners all receive events', () => {
      const w = new TelemetryWriter(mockDeps()); const a = vi.fn(); const b = vi.fn();
      w.subscribe(a); w.subscribe(b); w.emit('b1', 'tick');
      expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce();
    });
    it('listener throwing does not prevent other listeners', () => {
      const w = new TelemetryWriter(mockDeps());
      const bad = vi.fn().mockImplementation(() => { throw new Error('oops'); });
      const good = vi.fn(); w.subscribe(bad); w.subscribe(good);
      w.emit('b1', 'tick'); expect(good).toHaveBeenCalledOnce();
    });
  });
  describe('emit', () => {
    it('queues event without calling enqueue directly', () => {
      const deps = mockDeps(); const w = new TelemetryWriter(deps);
      w.emit('b1', 'fill', { orderId: 'o1' }); expect(deps.enqueue).not.toHaveBeenCalled();
    });
    it('assigns unique IDs prefixed with evt_', () => {
      const w = new TelemetryWriter(mockDeps()); const events: TradeEvent[] = [];
      w.subscribe((e) => { events.push(e); });
      w.emit('b1', 'tick'); w.emit('b1', 'fill');
      expect(events[0].id).not.toBe(events[1].id);
      expect(events[0].id).toMatch(/^evt_/);
    });
  });
  describe('convenience emitters', () => {
    function pair() {
      const w = new TelemetryWriter(mockDeps()); const fn = vi.fn(); w.subscribe(fn);
      return { w, fn, evt: (i?: number) => getEvent(fn, i) };
    }
    it('emitTick includes price and optional pnl', () => {
      const { w, evt } = pair(); w.emitTick('b1', 123.45, 5.2);
      expect(evt().eventType).toBe('tick');
      expect(evt().details.price).toBe(123.45);
      expect(evt().details.pnl).toBe(5.2);
    });
    it('emitFill includes all params and defaults pnl to 0', () => {
      const { w, evt } = pair(); w.emitFill('b1', 'ord-1', 'buy', 50.0, 10, 2.5);
      expect(evt().eventType).toBe('fill');
      expect(evt().details.orderId).toBe('ord-1');
      expect(evt().details.pnl).toBe(2.5);
      w.emitFill('b1', 'ord-1', 'sell', 50.0, 10);
      expect(evt(1).details.pnl).toBe(0);
    });
    it('emitSignal merges indicators', () => {
      const { w, evt } = pair(); w.emitSignal('b1', 'buy', { rsi: 30, macd: 0.5 });
      expect(evt().details.signal).toBe('buy');
      expect(evt().details.rsi).toBe(30);
    });
    it('emitError creates error event', () => {
      const { w, evt } = pair(); w.emitError('b1', 'timeout', 'ws');
      expect(evt().eventType).toBe('error');
      expect(evt().details.error).toBe('timeout');
      expect(evt().details.context).toBe('ws');
    });
    it('emitHalt includes reason', () => {
      const { w, evt } = pair(); w.emitHalt('b1', 'drawdown exceeded');
      expect(evt().eventType).toBe('halt');
      expect(evt().details.reason).toBe('drawdown exceeded');
    });
    it('emitResume has no extra details', () => {
      const { w, evt } = pair(); w.emitResume('b1');
      expect(evt().eventType).toBe('resume');
      expect(Object.keys(evt().details)).toHaveLength(0);
    });
    it('emitStart wraps config', () => {
      const { w, evt } = pair(); w.emitStart('b1', { strategy: 'grid' });
      expect(evt().details.config).toEqual({ strategy: 'grid' });
    });
    it('emitStop defaults reason to normal', () => {
      const { w, evt } = pair(); w.emitStop('b1');
      expect(evt().details.reason).toBe('normal');
    });
    it('emitStop uses provided reason', () => {
      const { w, evt } = pair(); w.emitStop('b1', 'manual');
      expect(evt().details.reason).toBe('manual');
    });
    it('emitPause has empty details', () => {
      const { w, evt } = pair(); w.emitPause('b1');
      expect(evt().eventType).toBe('pause');
    });
    it('emitRebalance carries old and new base', () => {
      const { w, evt } = pair(); w.emitRebalance('b1', 0.6, 0.7);
      expect(evt().details.oldBase).toBe(0.6); expect(evt().details.newBase).toBe(0.7);
    });
    it('emitExchangeHealth carries health data and timestamp', () => {
      const { w, evt } = pair();
      w.emitExchangeHealth('b1', {
        exchangeId: 'binance', score: 95, state: 'healthy',
        latencyMs: 45, failureCount: 0, rateLimitUsed: 12, rateLimitTotal: 1200,
      });
      expect(evt().eventType).toBe('exchange_health');
      expect(evt().details.exchangeId).toBe('binance');
      expect(evt().details.score).toBe(95);
      expect(evt().details.rateLimitUsed).toBe(12);
      expect(evt().details.timestamp).toBe(1000);
    });
    it('emitRateLimitUsage carries exchange and usage data', () => {
      const { w, evt } = pair();
      w.emitRateLimitUsage('b1', 'bybit', {
        endpoint: 'api', callsInWindow: 45, maxPerWindow: 120, windowMs: 60000,
      });
      expect(evt().eventType).toBe('rate_limit_usage');
      expect(evt().details.exchangeId).toBe('bybit');
      expect(evt().details.callsInWindow).toBe(45);
      expect(evt().details.maxPerWindow).toBe(120);
    });
  });
  describe('flush', () => {
    it('flushes queued events to D1 via enqueue', async () => {
      const deps = mockDeps(); const w = new TelemetryWriter(deps);
      w.emit('b1', 'tick', { price: 100 }); await flush();
      expect(deps.enqueue).toHaveBeenCalledOnce();
      const [sql, bindings] = deps.enqueue.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain('INSERT INTO trade_events');
      expect(bindings[0]).toMatch(/^evt_/);
      expect(bindings[1]).toBe('b1');
      expect(bindings[2]).toBe('tick');
    });
    it('splices 50 items per flush batch', async () => {
      const deps = mockDeps(); const w = new TelemetryWriter(deps);
      for (let i = 0; i < 5; i++) w.emit('b1', 'tick', { i });
      await flush(); expect(deps.enqueue).toHaveBeenCalledTimes(5);
    });
    it('does not start second flush while first is running', async () => {
      let resolveFlush: (() => void) | undefined;
      const deps = mockDeps();
      deps.enqueue.mockImplementation(() => new Promise((r) => { resolveFlush = r as () => void; }));
      const w = new TelemetryWriter(deps);
      w.emit('b1', 'tick'); w.emit('b2', 'fill');
      await new Promise((r) => setTimeout(r, 20));
      expect(deps.enqueue).toHaveBeenCalledTimes(1); resolveFlush?.();
    });
  });
  describe('snapshot', () => {
    const balances = [{ currency: 'USDT', free: 1000, used: 0, total: 1000 }];
    const cfg = { maxDrawdownPct: 20, winCount: 5, lossCount: 2, totalTrades: 7 };
    it('calls enqueue with capital_snapshots INSERT and emits metric_snapshot', async () => {
      const fn = vi.fn(); const deps = mockDeps(); const w = new TelemetryWriter(deps); w.subscribe(fn);
      await w.snapshot('b1', 10000, 500, balances, cfg);
      const [sql, b] = deps.enqueue.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain('INSERT INTO capital_snapshots');
      expect(b[1]).toBe('b1'); expect(b[2]).toBe(10000); expect(b[3]).toBe(500);
      expect(getEvent(fn).eventType).toBe('metric_snapshot');
      expect(getEvent(fn).details.capital).toBe(10000);
    });
    it('onFlushError fires and does not throw when enqueue fails', async () => {
      const deps = mockDeps(); deps.enqueue.mockRejectedValueOnce(new Error('D1 timeout'));
      const cbs = mockCallbacks();
      await expect(new TelemetryWriter(deps, cbs).snapshot('b1', 10000, 0, balances, cfg))
        .resolves.toBeUndefined();
      expect(cbs.onFlushError).toHaveBeenCalledOnce();
      expect(cbs.onFlushError.mock.calls[0][0].message).toBe('D1 timeout');
    });
  });
  describe('flush error handling', () => {
    it('onFlushError fires and non-retryable error does not re-queue', async () => {
      const deps = mockDeps(); deps.enqueue.mockRejectedValueOnce(new Error('DB down'));
      const cbs = mockCallbacks(); const w = new TelemetryWriter(deps, cbs);
      w.emit('b1', 'tick'); await flush();
      expect(cbs.onFlushError).toHaveBeenCalledOnce();
      expect(cbs.onFlushError.mock.calls[0][0].message).toBe('DB down');
    });
    it('non-retryable UNIQUE error does not re-queue', async () => {
      const deps = mockDeps(); deps.enqueue.mockRejectedValue(new Error('UNIQUE'));
      const w = new TelemetryWriter(deps); w.emit('b1', 'tick'); await flush();
      expect(deps.enqueue).toHaveBeenCalledTimes(1);
    });
    it('DESTINATION_ERR and database locked re-queue for retry', async () => {
      for (const msg of ['DESTINATION_ERR', 'database locked']) {
        const deps = mockDeps(); let n = 0;
        deps.enqueue.mockImplementation(async () => { n++; if (n === 1) throw new Error(msg); });
        const w = new TelemetryWriter(deps); w.emit('b1', 'tick'); await flush();
        await new Promise((r) => setTimeout(r, 30));
        expect(deps.enqueue).toHaveBeenCalledTimes(2);
      }
    });
  });
  describe('listener error isolation', () => {
    it('swallows listener errors without affecting flush', async () => {
      const deps = mockDeps(); const w = new TelemetryWriter(deps);
      w.subscribe(() => { throw new Error('bad'); });
      w.emit('b1', 'tick'); await flush();
      expect(deps.enqueue).toHaveBeenCalledOnce();
    });
  });
});
