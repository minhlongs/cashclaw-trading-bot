// Telemetry Writer — Pure helpers (event ID generator + retryable error predicate)

export function generateEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isRetryableTelemetryError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  return msg.includes('DESTINATION_ERR') || msg.includes('locked');
}
