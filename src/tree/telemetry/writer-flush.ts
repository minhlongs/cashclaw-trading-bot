import type { TradeEvent } from './types';
import type { TelemetryWriterDeps, TelemetryWriterCallbacks } from './writer-types';
import { INSERT_TRADE_EVENT_SQL, buildEventInsertParams } from './writer-sql';
import { isRetryableTelemetryError } from './writer-helpers';

export interface QueueItem { event: TradeEvent; retries: number; }

export async function flushTelemetryBatch(
  queue: QueueItem[], deps: TelemetryWriterDeps, callbacks: TelemetryWriterCallbacks, maxRetries = 3,
): Promise<void> {
  const batch = queue.splice(0, 50);
  for (const { event } of batch) {
    try {
      await deps.enqueue(INSERT_TRADE_EVENT_SQL, buildEventInsertParams(event));
    } catch (e) {
      if (isRetryableTelemetryError(e) && 1 < maxRetries) queue.unshift({ event, retries: 1 });
      callbacks.onFlushError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
