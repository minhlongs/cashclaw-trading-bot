import { describe, expect, it, vi } from 'vitest';
import { createPaperAdapter } from './paper-adapter';
import type { Ticker } from '../exchange/types';

const order = { symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.1 } as const;

describe('paper execution price guards', () => {
  it.each([undefined, 0, -1, NaN, Infinity])('rejects unavailable or invalid price %s without a fill', async (price) => {
    const adapter = createPaperAdapter(10000);
    const result = await adapter.placeOrder({ ...order, price });
    expect(result).toMatchObject({ status: 'rejected', filled: 0, fee: 0 });
    expect(await adapter.fetchOpenOrders(order.symbol)).toEqual([]);
  });

  it('rejects when the ticker source fails', async () => {
    const adapter = createPaperAdapter(10000, { tickerFetcher: vi.fn().mockRejectedValue(new Error('offline')) });
    expect(await adapter.placeOrder(order)).toMatchObject({ status: 'rejected', filled: 0, fee: 0 });
  });

  it('uses a valid fetched price and charges quote-currency fees', async () => {
    const tickerFetcher = vi.fn().mockResolvedValue({ last: 50000 } as Ticker);
    const adapter = createPaperAdapter(10000, { tickerFetcher });
    expect(await adapter.placeOrder(order)).toMatchObject({ status: 'filled', price: 50000, filled: 0.1, fee: 5 });
    expect(tickerFetcher).toHaveBeenCalledWith(order.symbol);
  });
});
