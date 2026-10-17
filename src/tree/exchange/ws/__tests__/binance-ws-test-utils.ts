import { vi } from 'vitest';
import { BinanceWsConnection } from '../binance-ws-connection';

export class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  readyState = 0;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

export function setupWsTestEnvironment() {
  vi.useFakeTimers();
  MockWebSocket.reset();
  vi.stubGlobal('WebSocket', MockWebSocket);
}

export function teardownWsTestEnvironment() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
}

export function makeSub(
  overrides: Partial<{ symbol: string; type: 'ticker' | 'orderbook' | 'trade' | 'kline' }> = {}
) {
  return {
    exchange: 'binance' as const,
    symbol: overrides.symbol ?? 'BTCUSDT',
    type: overrides.type ?? 'ticker',
    callback: {
      onTicker: vi.fn(),
      onOrderBook: vi.fn(),
      onTrade: vi.fn(),
      onKline: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    },
  };
}

export function asMock(fn: unknown): ReturnType<typeof vi.fn> {
  return fn as ReturnType<typeof vi.fn>;
}

export function subscribeAndOpen(
  conn: BinanceWsConnection,
  subOverrides?: Partial<{ symbol: string; type: 'ticker' | 'orderbook' | 'trade' | 'kline' }>
) {
  const sub = makeSub(subOverrides);
  const id = conn.subscribe(sub);
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  ws.simulateOpen();
  return { id, ws, sub };
}
