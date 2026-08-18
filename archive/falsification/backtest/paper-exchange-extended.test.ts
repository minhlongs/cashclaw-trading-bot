import { describe, it, expect, beforeEach } from 'vitest';
import { PaperExchange } from './paper-exchange';

describe('PaperExchange — extended coverage', () => {
  let ex: PaperExchange;

  beforeEach(() => {
    // capital=10_000, fee=0.1%, slip=0.05%
    ex = new PaperExchange(10_000, 0.001, 0.0005);
    ex.setTimestamp(1_000_000);
  });

  // ---- getCapital (lines 47-49) ----
  it('getCapital returns current capital', () => {
    expect(ex.getCapital()).toBe(10_000);
  });

  it('getCapital reflects post-fill capital', async () => {
    // buy 1 @ 1000 → cost ≈ 1000.5 + fee ≈ 1.0005 → capital ~ 8998.499
    await ex.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 1, price: 1000 });
    expect(ex.getCapital()).toBeLessThan(10_000);
  });

  // ---- placeOrder: buy success (lines 54-71) ----
  it('placeOrder buy deducts cost from capital', async () => {
    const res = await ex.placeOrder({
      symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 2, price: 1000,
    });
    expect(res.status).toBe('filled');
    // slip = 1+0.0005/100 = 1.000005, price = 1000.005
    // fee = 1000.005*2*0.00001 = 0.0200001, cost = 2000.01+0.0200001 = 2000.0300001
    expect(ex.getCapital()).toBeCloseTo(7999.97, 2);
  });

  // ---- placeOrder: buy rejected (lines 60-64) ----
  it('placeOrder buy rejected when cost exceeds capital', async () => {
    // 11 @ 1000 → cost > 10_000
    const res = await ex.placeOrder({
      symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 11, price: 1000,
    });
    expect(res.status).toBe('rejected');
    expect(res.id).toBe('');
    expect(ex.getCapital()).toBe(10_000);
  });

  // ---- placeOrder: sell (lines 66-67) ----
  it('placeOrder sell adds proceeds minus fee to capital', async () => {
    const res = await ex.placeOrder({
      symbol: 'ETH/USDT', side: 'sell', type: 'market', quantity: 5, price: 200,
    });
    expect(res.status).toBe('filled');
    // slip = 1-0.0005/100=0.999995, price=199.999, fee=199.999*5*0.00001=0.00999995
    // proceeds = 199.999*5 - 0.00999995 = 999.98500005
    expect(ex.getCapital()).toBeCloseTo(10_999.985, 2);
  });

  // ---- placeOrder fill record (line 70) ----
  it('placeOrder records fill with correct metadata', async () => {
    await ex.placeOrder({
      symbol: 'SOL/USDT', side: 'buy', type: 'limit', quantity: 3, price: 50,
    });
    expect(ex.fills).toHaveLength(1);
    const f = ex.fills[0];
    expect(f.side).toBe('buy');
    expect(f.quantity).toBe(3);
    expect(f.timestamp).toBe(1_000_000);
  });

  // ---- placeOrder return shape (line 71) ----
  it('placeOrder returns correct OrderResult fields', async () => {
    const res = await ex.placeOrder({
      symbol: 'BTC/USDT', side: 'sell', type: 'market', quantity: 1, price: 1000,
    });
    expect(res.id).toContain('paper_sell_');
    expect(res.symbol).toBe('BTC/USDT');
    expect(res.filled).toBe(1);
    expect(res.quantity).toBe(1);
    expect(res.timestamp).toBe(1_000_000);
  });

  // ---- placeMarketOrder: buy success (lines 74-90) ----
  it('placeMarketOrder buy deducts cost from capital', async () => {
    const res = await ex.placeMarketOrder('buy', 2, 1000);
    expect(res.status).toBe('filled');
    // same as placeOrder: price=1000.005, fee=0.0200001, cost=2000.0300001
    expect(ex.getCapital()).toBeCloseTo(7999.97, 2);
  });

  // ---- placeMarketOrder: buy rejected (lines 81-82) ----
  it('placeMarketOrder buy rejected when cost exceeds capital', async () => {
    const res = await ex.placeMarketOrder('buy', 11, 1000);
    expect(res.status).toBe('rejected');
    expect(ex.getCapital()).toBe(10_000);
  });

  // ---- placeMarketOrder: sell (lines 85-86) ----
  it('placeMarketOrder sell adds proceeds minus fee to capital', async () => {
    const res = await ex.placeMarketOrder('sell', 5, 200);
    expect(res.status).toBe('filled');
    // slip=0.999995, price=199.999, fee=0.00999995, proceeds=999.98500005
    expect(ex.getCapital()).toBeCloseTo(10_999.985, 2);
  });

  // ---- placeMarketOrder: fill record (line 89) ----
  it('placeMarketOrder records fill', async () => {
    await ex.placeMarketOrder('buy', 1, 1000);
    expect(ex.fills).toHaveLength(1);
    expect(ex.fills[0].side).toBe('buy');
  });

  // ---- placeMarketOrder: return shape (line 90) ----
  it('placeMarketOrder returns correct OrderResult', async () => {
    const res = await ex.placeMarketOrder('sell', 3, 500);
    expect(res.id).toContain('paper_sell_');
    expect(res.type).toBe('market');
    expect(res.filled).toBe(3);
    expect(res.status).toBe('filled');
  });

  // ---- zero-fee edge case for placeOrder ----
  it('placeOrder buy with zero fee only deducts price*qty', async () => {
    const zero = new PaperExchange(5000, 0, 0);
    const res = await zero.placeOrder({
      symbol: 'ETH/USDT', side: 'buy', type: 'market', quantity: 5, price: 200,
    });
    expect(res.status).toBe('filled');
    expect(res.fee).toBe(0);
    expect(zero.getCapital()).toBe(4000);
  });

  // ---- zero-fee edge case for placeMarketOrder ----
  it('placeMarketOrder sell with zero fee adds full proceeds', async () => {
    const zero = new PaperExchange(5000, 0, 0);
    const res = await zero.placeMarketOrder('sell', 5, 200);
    expect(res.status).toBe('filled');
    expect(res.fee).toBe(0);
    expect(zero.getCapital()).toBe(6000);
  });
});
