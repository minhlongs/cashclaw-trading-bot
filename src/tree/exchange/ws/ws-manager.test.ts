import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsManager } from './ws-manager';

// --- mocks ---
vi.mock('./binance-ws-connection', () => ({
  BinanceWsConnection: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue('sub-1'),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('./ws-connection', () => ({
  WsConnection: class {},
}));

// --- helpers ---
function makeSub(overrides?: Partial<{ exchange: string; type: string; symbol: string }>) {
  return {
    exchange: overrides?.exchange ?? 'binance',
    type: (overrides?.type ?? 'ticker') as 'ticker',
    symbol: overrides?.symbol ?? 'BTC/USDT',
    callback: { onTicker: vi.fn() },
  };
}

// --- tests ---
describe('WsManager', () => {
  let mgr: WsManager;

  beforeEach(() => {
    mgr = new WsManager();
  });

  // --- subscribe ---
  describe('subscribe', () => {
    it('creates connection on first subscribe for an exchange:type', async () => {
      const id = await mgr.subscribe(makeSub());
      expect(id).toBe('sub-1');
      expect(mgr.getActiveConnectionCount()).toBe(1);
    });

    it('reuses existing connection for same exchange:type', async () => {
      await mgr.subscribe(makeSub({ symbol: 'BTC/USDT' }));
      await mgr.subscribe(makeSub({ symbol: 'ETH/USDT' }));
      // Still only 1 connection
      expect(mgr.getActiveConnectionCount()).toBe(1);
    });

    it('creates separate connections for different exchange:type combos', async () => {
      await mgr.subscribe(makeSub({ exchange: 'binance', type: 'ticker' }));
      await mgr.subscribe(makeSub({ exchange: 'binance', type: 'orderbook' }));
      expect(mgr.getActiveConnectionCount()).toBe(2);
    });

    it('throws when max connections (6) exceeded', async () => {
      for (let i = 0; i < 6; i++) {
        await mgr.subscribe(makeSub({ type: `type${i}` as 'ticker' }));
      }
      await expect(mgr.subscribe(makeSub({ type: 'overflow' as 'ticker' }))).rejects.toThrow(
        'Max WebSocket connections reached (6)',
      );
    });

    it('throws for unsupported exchange', async () => {
      await expect(mgr.subscribe(makeSub({ exchange: 'kraken' }))).rejects.toThrow(
        'Unsupported exchange for WS: kraken',
      );
    });

    it('is case-insensitive on exchange name', async () => {
      const id = await mgr.subscribe(makeSub({ exchange: 'Binance' }));
      expect(id).toBe('sub-1');
    });
  });

  // --- unsubscribe ---
  describe('unsubscribe', () => {
    it('removes subscription from globalSubs', async () => {
      const id = await mgr.subscribe(makeSub());
      mgr.unsubscribe(id);
      // Connection stays alive (no disconnect)
      expect(mgr.getActiveConnectionCount()).toBe(1);
    });

    it('does nothing for unknown subId', () => {
      // Should not throw
      mgr.unsubscribe('nonexistent-id');
      expect(mgr.getActiveConnectionCount()).toBe(0);
    });
  });

  // --- disconnectAll ---
  describe('disconnectAll', () => {
    it('disconnects all connections and clears state', async () => {
      await mgr.subscribe(makeSub({ type: 'ticker' }));
      await mgr.subscribe(makeSub({ type: 'orderbook' }));
      expect(mgr.getActiveConnectionCount()).toBe(2);

      mgr.disconnectAll();

      expect(mgr.getActiveConnectionCount()).toBe(0);
    });

    it('is safe to call on empty manager', () => {
      mgr.disconnectAll();
      expect(mgr.getActiveConnectionCount()).toBe(0);
    });
  });

  // --- getActiveConnectionCount ---
  describe('getActiveConnectionCount', () => {
    it('returns 0 for fresh manager', () => {
      expect(mgr.getActiveConnectionCount()).toBe(0);
    });

    it('increments with each unique exchange:type', async () => {
      await mgr.subscribe(makeSub({ type: 'ticker' }));
      expect(mgr.getActiveConnectionCount()).toBe(1);
      await mgr.subscribe(makeSub({ type: 'orderbook' }));
      expect(mgr.getActiveConnectionCount()).toBe(2);
    });
  });
});
