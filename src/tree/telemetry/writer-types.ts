// Telemetry Writer — Dependency & callback interfaces
import type { TradeEvent } from './types';

export type Listener = (event: TradeEvent) => void | Promise<void>;

export interface TelemetryWriterDeps {
  enqueue: (sql: string, bindings: unknown[]) => Promise<unknown>;
}

export interface TelemetryWriterCallbacks {
  onFlushError?: (error: Error) => void;
}
