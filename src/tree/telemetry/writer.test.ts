import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelemetryWriter } from './writer';
import type { TradeEvent } from './types';

function createMockDeps() {
  const enqueue = vi.fn(async () => {});
  return { enqueue };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TelemetryWriter', () => {
  it('creates an instance', () => {
    const writer = new TelemetryWriter(createMockDeps());
    expect(writer).toBeDefined();
  });

  it('emit queues an event with correct fields', async () => {
    const deps = createMockDeps();
    const writer = new TelemetryWriter(deps);
    writer.emit('bot-1', 'start', { symbol: 'BTC/USDT' });

    await new Promise((r) => setTimeout(r, 10));

    expect(deps.enqueue).toHaveBeenCalledOnce();
    const [sql, bindings] = deps.enqueue.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('trade_events');
    expect(bindings[1]).toBe('bot-1');
    expect(bindings[2]).toBe('start');
  });

  it('emitError creates error event', async () => {
    const deps = createMockDeps();
    const writer = new TelemetryWriter(deps);
    writer.emitError('bot-1', 'connection lost', 'ws');

    await new Promise((r) => setTimeout(r, 10));

    const [, bindings] = deps.enqueue.mock.calls[0] as unknown as [string, unknown[]];
    expect(bindings[1]).toBe('bot-1');
    expect(bindings[2]).toBe('error');
    const details = JSON.parse(bindings[3] as string) as Record<string, unknown>;
    expect(details.context).toBe('ws');
  });

  it('flush is no-op when queue empty', async () => {
    const deps = createMockDeps();
    new TelemetryWriter(deps);
    await new Promise((r) => setTimeout(r, 10));
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('each emit creates its own enqueue call', async () => {
    const deps = createMockDeps();
    const writer = new TelemetryWriter(deps);
    writer.emit('bot-1', 'tick', {});
    writer.emit('bot-2', 'fill', {});
    writer.emit('bot-3', 'signal', {});

    await new Promise((r) => setTimeout(r, 10));

    expect(deps.enqueue).toHaveBeenCalledTimes(3);
  });

  it('subscribe receives emitted events', async () => {
    const deps = createMockDeps();
    const writer = new TelemetryWriter(deps);
    const listener = vi.fn();

    writer.subscribe(listener);
    writer.emit('bot-1', 'start', {});

    await new Promise((r) => setTimeout(r, 10));

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as TradeEvent;
    expect(event.botId).toBe('bot-1');
    expect(event.eventType).toBe('start');
  });

  it('unsubscribe stops events', async () => {
    const deps = createMockDeps();
    const writer = new TelemetryWriter(deps);
    const listener = vi.fn();

    const unsub = writer.subscribe(listener);
    unsub();
    writer.emit('bot-1', 'start', {});

    await new Promise((r) => setTimeout(r, 10));

    expect(listener).not.toHaveBeenCalled();
  });

  it('onFlushError callback fires on enqueue failure', async () => {
    const deps = createMockDeps();
    deps.enqueue.mockRejectedValueOnce(new Error('DB down'));
    const onFlushError = vi.fn();
    const writer = new TelemetryWriter(deps, { onFlushError });
    writer.emit('bot-1', 'start', {});

    await new Promise((r) => setTimeout(r, 10));

    expect(onFlushError).toHaveBeenCalledOnce();
    expect(onFlushError.mock.calls[0][0].message).toBe('DB down');
  });
});
