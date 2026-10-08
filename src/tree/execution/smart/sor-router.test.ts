import { describe, it, expect } from 'vitest';
import { routeOrderSlices } from './sor-router';
import type { VenueLiquidityProfile } from './smart-execution-types';

describe('sor-router', () => {
  const venues: VenueLiquidityProfile[] = [
    {
      exchange: 'binance',
      topAskPrice: 100.0,
      topBidPrice: 99.8,
      depthSize: 5.0,
      takerFeeBps: 10, // 0.10% -> 100.1
      makerFeeBps: 2,
    },
    {
      exchange: 'okx',
      topAskPrice: 99.5,
      topBidPrice: 99.4,
      depthSize: 3.0,
      takerFeeBps: 8, // 0.08% -> 99.5796 (best for buy)
      makerFeeBps: 2,
    },
  ];

  it('routes buy orders to the lowest effective price venue first', () => {
    const allocations = routeOrderSlices(5.0, 'buy', venues);
    expect(allocations).toHaveLength(2);
    // OKX should get filled up to 3.0 first
    expect(allocations[0].exchange).toBe('okx');
    expect(allocations[0].allocatedQuantity).toBe(3.0);
    // Binance gets the remaining 2.0
    expect(allocations[1].exchange).toBe('binance');
    expect(allocations[1].allocatedQuantity).toBe(2.0);
  });

  it('returns empty when target quantity is non-positive or venues empty', () => {
    expect(routeOrderSlices(0, 'buy', venues)).toEqual([]);
    expect(routeOrderSlices(5.0, 'buy', [])).toEqual([]);
  });
});
