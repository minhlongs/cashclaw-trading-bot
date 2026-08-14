import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelemetryWriter, type TelemetryWriterDeps, type TelemetryWriterCallbacks } from './writer';
import type { TradeEvent } from './types';

function createDeps(): TelemetryWriterDeps & { enqueue: ReturnType<typeof vi.fn> } {
  return { enqueue: vi.fn().mockResolvedValue(undefined) };
}

function createWriter(
  deps: TelemetryWriterDeps = createDeps(),
  callbacks: TelemetryWriterCallbacks = {},
) {
  return new TelemetryWriter(deps, callbacks);
}

function queueLength(writer: TelemetryWriter): number {
  return (writer as unknown as { queue: Array<{ event: TradeEvent; retries: number }> }).queue.length;
}

describe('TelemetryWriter', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  describe('emit', () => {
    it('adds event to queue', () => {
      const writer = createWriter(deps);
      writer.emit('bot-1', 'start');
      expect(queueLength(writer)).toBe(1);
    });

    it('queues multiple events', () => {
      const writer = createWriter(deps);
      writer.emit('bot-1', 'start');
      writer.emit('bot-1', 'tick');
      writer.emit('bot-1', 'stop');
      expect(queueLength(writer)).toBe(3);
    });

    it('sets botId and eventType correctly', () => {
      const writer = createWriter(deps);
      const received: TradeEvent[] = [];
      writer.subscribe((e) => { received.push(e); });
      writer.emit('bot-1', 'start');
      expect(received[0].botId).toBe('bot-1');
      expect(received[0].eventType).toBe('start');
    });
  });

  describe('subscribe', () => {
    it('notifies listener when event is emitted', () => {
      const writer = createWriter(deps);
      const received: TradeEvent[] = [];
      writer.subscribe((e) => { received.push(e); });
      writer.emit('bot-1', 'start');
      expect(received).toHaveLength(1);
      expect(received[0].eventType).toBe('start');
    });

    it('unsubscribes listener', () => {
      const writer = createWriter(deps);
      const received: TradeEvent[] = [];
      const unsub = writer.subscribe((e) => { received.push(e); });
      writer.emit('bot-1', 'start');
      expect(received).toHaveLength(1);
      unsub();
      writer.emit('bot-1', 'stop');
      expect(received).toHaveLength(1);
    });

    it('supports multiple independent listeners', () => {
      const writer = createWriter(deps);
      const a: TradeEvent[] = [];
      const b: TradeEvent[] = [];
      writer.subscribe((e) => { a.push(e); });
      writer.subscribe((e) => { b.push(e); });

      writer.emit('bot-1', 'start');
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
    });
  });

  describe('flush', () => {
    it('calls enqueue for each queued event', async () => {
      const writer = createWriter(deps);
      writer.emit('bot-1', 'start');
      writer.emit('bot-1', 'stop');
      await (writer as unknown as { flush: () => Promise<void> }).flush();
      expect(deps.enqueue).toHaveBeenCalledTimes(2);
      expect(queueLength(writer)).toBe(0);
    });

    it('does not run second flush while first is in progress', async () => {
      let resolve: () => void;
      const firstFlush = new Promise<void>((r) => { resolve = r; });
      deps.enqueue.mockReturnValueOnce(firstFlush).mockResolvedValue(undefined);

      const writer = createWriter(deps);
      writer.emit('bot-1', 'start');
      const flushPromise = (writer as unknown as { flush: () => Promise<void> }).flush();
      const secondFlush = (writer as unknown as { flush: () => Promise<void> }).flush();

      resolve!();
      await flushPromise;
      await secondFlush;
      expect(deps.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('callbacks', () => {
    it('calls onFlushError when enqueue fails', async () => {
      const onError = vi.fn();
      deps.enqueue.mockRejectedValueOnce(new Error('db down'));
      const writer = createWriter(deps, { onFlushError: onError });
      writer.emit('bot-1', 'start');
      await (writer as unknown as { flush: () => Promise<void> }).flush();
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
    });
  });
});
