import type { WsSubscription } from './ws-types';
import { buildSubscriptionId, streamKeyFor } from './binance-ws-connection-streams';

export function subscribeStream(
  subs: Map<string, WsSubscription>,
  streams: string[],
  sub: Omit<WsSubscription, 'id'>,
  rebuild: () => void,
): string {
  const id = buildSubscriptionId(sub.symbol, sub.type);
  subs.set(id, { ...sub, id });
  streams.push(streamKeyFor(sub.type, sub.symbol));
  rebuild();
  return id;
}

export function unsubscribeStream(
  subs: Map<string, WsSubscription>,
  streams: string[],
  subId: string,
  disconnect: () => void,
  rebuild: () => void,
): string[] {
  const sub = subs.get(subId);
  if (!sub) return streams;
  const filtered = streams.filter((s) => s !== streamKeyFor(sub.type, sub.symbol));
  subs.delete(subId);
  if (filtered.length === 0) disconnect();
  else rebuild();
  return filtered;
}
