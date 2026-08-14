import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockGetProvider } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockGetProvider: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ createLogger: vi.fn(() => mockLogger) }));
vi.mock('@/land/exchange-orchestration', () => ({
  getExchangeOrchestrator: vi.fn(() => ({ getProvider: mockGetProvider })),
}));

import { getExchangeHealth } from './exchange-health';

describe('getExchangeHealth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns not_registered for unregistered exchanges', async () => {
    mockGetProvider.mockReturnValue(null);
    const cards = await getExchangeHealth();
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.state === 'not_registered')).toBe(true);
    expect(cards.every((c) => c.score === 0)).toBe(true);
  });

  it('returns healthy state for high-score provider', async () => {
    mockGetProvider.mockReturnValue({
      getHealth: () => ({ score: 95, lastSuccess: Date.now(), failureCount: 0, latencyMs: 45 }),
      getBudget: () => ({ reqPerMin: 1200, reqPerHour: 72000 }),
      isCircuitOpen: () => false,
      getBackoffMs: () => 0,
    });
    const cards = await getExchangeHealth();
    const binance = cards.find((c) => c.exchangeId === 'binance')!;
    expect(binance.state).toBe('healthy');
    expect(binance.score).toBe(95);
    expect(binance.latencyMs).toBe(45);
    expect(binance.isCircuitOpen).toBe(false);
  });

  it('returns degraded state for medium-score provider', async () => {
    mockGetProvider.mockReturnValue({
      getHealth: () => ({ score: 60, lastSuccess: Date.now(), failureCount: 3, latencyMs: 200 }),
      getBudget: () => ({ reqPerMin: 120, reqPerHour: 7200 }),
      isCircuitOpen: () => false,
      getBackoffMs: () => 0,
    });
    const cards = await getExchangeHealth();
    const bybit = cards.find((c) => c.exchangeId === 'bybit')!;
    expect(bybit.state).toBe('degraded');
  });

  it('returns circuit_open state when provider circuit is open', async () => {
    mockGetProvider.mockReturnValue({
      getHealth: () => ({ score: 10, lastSuccess: Date.now(), failureCount: 15, latencyMs: 500 }),
      getBudget: () => ({ reqPerMin: 60, reqPerHour: 3600 }),
      isCircuitOpen: () => true,
      getBackoffMs: () => 30000,
    });
    const cards = await getExchangeHealth();
    const okx = cards.find((c) => c.exchangeId === 'okx')!;
    expect(okx.state).toBe('circuit_open');
    expect(okx.isCircuitOpen).toBe(true);
    expect(okx.backoffMs).toBe(30000);
  });

  it('handles provider that throws gracefully', async () => {
    mockGetProvider.mockImplementation(() => { throw new Error('provider init failed'); });
    const cards = await getExchangeHealth();
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.state === 'error')).toBe(true);
  });
});
