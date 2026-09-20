// Binance Combined Streams WebSocket — private handler logic.
// Builds the combined-streams URL from the subscribed streams and assigns
// the WebSocket event handlers (open, message, error, close).

import { createLogger } from '@/lib/logger';

const log = createLogger('binance-ws');

/** Build the combined-streams URL: ${baseUrl}/stream?streams=${names.join('/')}. */
export function buildCombinedStreamUrl(baseUrl: string, streams: readonly string[]): string {
  return `${baseUrl}/stream?streams=${streams.join('/')}`;
}

/**
 * Assign WebSocket handlers for Binance combined streams.
 * - onopen: marks the connection connected, resolves the open promise.
 * - onmessage: parses JSON envelope { stream, data } and dispatches.
 * - onerror: notifies every subscriber's onError and schedules reconnect.
 * - onclose: marks disconnected, notifies onClose, schedules reconnect.
 */
export function assignWsHandlers(params: {
  ws: WebSocket;
  markConnected: () => void;
  onErrorNotify: (msg: string) => void;
  onCloseNotify: () => void;
  onMessageDispatch: (stream: string, data: Record<string, unknown>) => void;
  scheduleReconnect: () => void;
  resolveOpen: () => void;
  rejectOpen: (err: unknown) => void;
}): void {
  const {
    ws,
    markConnected,
    onErrorNotify,
    onCloseNotify,
    onMessageDispatch,
    scheduleReconnect,
    resolveOpen,
    rejectOpen,
  } = params;

  ws.onopen = () => {
    markConnected();
    resolveOpen();
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.stream && data.data) {
        onMessageDispatch(data.stream, data.data);
      }
    } catch (error) {
      log.debug('Non-JSON WebSocket message', {
        action: 'onmessage',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  ws.onerror = () => {
    onErrorNotify('WebSocket error');
    scheduleReconnect();
  };

  ws.onclose = () => {
    onCloseNotify();
    scheduleReconnect();
  };
  void rejectOpen;
}
