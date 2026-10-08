import { describe, it, expect } from 'vitest';
import { buildRateGraphEdges, type MarketTickerQuote } from './triangular-rate-graph';
import { detectTriangularArbitrage } from './bellman-ford-detector';

describe('Triangular Arbitrage Engine', () => {
  it('builds directed log rate edges correctly with bid/ask spreads', () => {
    const quotes: MarketTickerQuote[] = [
      {
        pair: 'BTC/USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        askPrice: 60000,
        bidPrice: 59990,
        askSize: 2.0,
        bidSize: 3.0,
        feeBps: 10,
      },
    ];

    const edges = buildRateGraphEdges(quotes);
    expect(edges).toHaveLength(2);

    const usdtToBtc = edges.find((e) => e.fromSymbol === 'USDT' && e.toSymbol === 'BTC');
    expect(usdtToBtc).toBeDefined();
    expect(usdtToBtc?.rate).toBeCloseTo(1 / 60000);
    expect(usdtToBtc?.logWeight).toBeGreaterThan(0);

    const btcToUsdt = edges.find((e) => e.fromSymbol === 'BTC' && e.toSymbol === 'USDT');
    expect(btcToUsdt).toBeDefined();
    expect(btcToUsdt?.rate).toBe(59990);
  });

  it('detects profitable triangular arbitrage opportunity when price inefficiency exists', () => {
    // Synthetic market: USDT -> BTC -> ETH -> USDT
    // Rate 1: USDT -> BTC at 50,000 (1 USDT = 1/50,000 BTC)
    // Rate 2: BTC -> ETH at 0.05 BTC/ETH (1 BTC = 20 ETH)
    // Rate 3: ETH -> USDT at 2,600 USDT (1 ETH = 2,600 USDT)
    // Gross: (1/50000) * 20 * 2600 = 52,000 / 50,000 = 1.04 (+4% gross)
    const quotes: MarketTickerQuote[] = [
      {
        pair: 'BTC/USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        askPrice: 50000,
        bidPrice: 49950,
        askSize: 10,
        bidSize: 10,
        feeBps: 5,
      },
      {
        pair: 'ETH/BTC',
        baseAsset: 'ETH',
        quoteAsset: 'BTC',
        askPrice: 0.05,
        bidPrice: 0.0499,
        askSize: 100,
        bidSize: 100,
        feeBps: 5,
      },
      {
        pair: 'ETH/USDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
        askPrice: 2605,
        bidPrice: 2600,
        askSize: 50,
        bidSize: 50,
        feeBps: 5,
      },
    ];

    const edges = buildRateGraphEdges(quotes);
    const opportunity = detectTriangularArbitrage(edges, 'USDT', 10);

    expect(opportunity).not.toBeNull();
    expect(opportunity?.cycleSymbols).toEqual(['USDT', 'BTC', 'ETH', 'USDT']);
    expect(opportunity?.grossMultiplier).toBeGreaterThan(1.03);
    expect(opportunity?.netMultiplier).toBeGreaterThan(1.02);
    expect(opportunity?.netProfitBps).toBeGreaterThan(200); // > 200 bps profit
    expect(opportunity?.bottleneckDepth).toBeGreaterThan(0);
  });

  it('returns null when no profitable triangular opportunity exists after fees', () => {
    // Efficient market: gross = 1.0, fees make net < 1.0
    const quotes: MarketTickerQuote[] = [
      {
        pair: 'BTC/USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        askPrice: 60000,
        bidPrice: 59990,
        askSize: 5,
        bidSize: 5,
        feeBps: 10,
      },
      {
        pair: 'ETH/BTC',
        baseAsset: 'ETH',
        quoteAsset: 'BTC',
        askPrice: 0.05,
        bidPrice: 0.0499,
        askSize: 50,
        bidSize: 50,
        feeBps: 10,
      },
      {
        pair: 'ETH/USDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
        askPrice: 3000,
        bidPrice: 2998,
        askSize: 50,
        bidSize: 50,
        feeBps: 10,
      },
    ];

    const edges = buildRateGraphEdges(quotes);
    const opportunity = detectTriangularArbitrage(edges, 'USDT', 5.0);

    expect(opportunity).toBeNull();
  });
});
