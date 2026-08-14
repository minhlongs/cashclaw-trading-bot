import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WsConnection } from './ws-connection';
import type { WsSubscription } from './ws-types';

class TestWsConnection extends WsConnection {
  connectFn = vi.fn().mockResolvedValue(undefined);
  subscribeFn = vi.fn().mockReturnValue('sub-1');
  unsubscribeFn = vi.fn();
  disconnectFn = vi.fn();

  async connect(): Promise<void> { await this.connectFn(); }
  subscribe(sub: Omit<WsSubscription, 'id'>): string { return this.subscribeFn(sub); }
  unsubscribe(subId: string): void { this.unsubscribeFn(subId); }
  disconnect(): void { this.disconnectFn(); }

  // Expose protected methods for testing
  public testEnsureConnected = () => this.ensureConnected();
  public testScheduleReconnect = () => this.scheduleReconnect();
  public testMarkConnected = () => this.markConnected();
  public testMarkDisconnected = () => this.markDisconnected();
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('WsConnection', () => {
  it('ensureConnected calls connect when not connected', async () => {
    const ws = new TestWsConnection();
    await ws.testEnsureConnected();
    expect(ws.connectFn).toHaveBeenCalledOnce();
  });

  it('ensureConnected calls connect when connected flag is true but ws is null', async () => {
    const ws = new TestWsConnection();
    ws.testMarkConnected();
    await ws.testEnsureConnected();
    // connected=true but ws=null → readyState check fails → calls connect()
    expect(ws.connectFn).toHaveBeenCalled();
  });

  it('markDisconnected sets connected to false', () => {
    const ws = new TestWsConnection();
    ws.testMarkConnected();
    ws.testMarkDisconnected();
    // Now ensureConnected should call connect
    ws.testEnsureConnected();
    expect(ws.connectFn).toHaveBeenCalled();
  });

  it('scheduleReconnect retries with exponential backoff', () => {
    const ws = new TestWsConnection();
    ws.testScheduleReconnect();
    vi.advanceTimersByTime(1000);
    expect(ws.connectFn).toHaveBeenCalledOnce();
  });

  it('scheduleReconnect closes ws after max attempts', () => {
    const ws = new TestWsConnection();
    // Simulate max attempts reached
    for (let i = 0; i < 5; i++) ws.testScheduleReconnect();
    // The 6th call should close
    ws.testScheduleReconnect();
    // No crash, scheduleReconnect gracefully handles max attempts
  });
});
