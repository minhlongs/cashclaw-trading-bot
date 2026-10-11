import { assignWsHandlers } from './binance-ws-connection-handlers';
import type { WsSubscription } from './ws-types';

export interface OpenWsCallbacks {
  markConnected: () => void; markDisconnected: () => void; scheduleReconnect: () => void;
  dispatch: (stream: string, data: Record<string, unknown>) => void;
  subscriptions: Map<string, WsSubscription>; setWs: (ws: WebSocket) => void;
}

export function openWs(url: string, cb: OpenWsCallbacks): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(url);
      cb.setWs(ws);
      assignWsHandlers({
        ws, markConnected: cb.markConnected,
        onErrorNotify: () => { for (const [, s] of cb.subscriptions) s.callback.onError?.(new Error('WebSocket error')); cb.markDisconnected(); },
        onCloseNotify: () => { cb.markDisconnected(); for (const [, s] of cb.subscriptions) s.callback.onClose?.(); },
        onMessageDispatch: cb.dispatch, scheduleReconnect: cb.scheduleReconnect,
        resolveOpen: () => resolve(), rejectOpen: (err) => reject(err),
      });
    } catch (err) { reject(err); }
  });
}

export async function rebuildWs(ws: WebSocket | null, connected: boolean, streams: string[], connect: () => Promise<void>): Promise<void> {
  if (connected && ws?.readyState === WebSocket.OPEN) ws.close();
  if (streams.length > 0) connect().catch(() => {});
}
