import { describe, it, expect, vi } from 'vitest';
import { AvellanedaStoikovEngine } from '@/quant/avellaneda-stoikov';
import { BasisCalculator } from '@/arbitrage/basis-calculator';
import { CrossDomainExecutor } from '@/execution/cross-domain-executor';
import { computeSabrVol } from '@/quant/sabr-engine';
import { black76 } from '@/quant/black-76';
import { scanVolatilitySurface, type MarketOption } from '@/arbitrage/vol-surface-arb';

describe('V7 Multi-Pillar Quantitative Simulation Suite', () => {
  it('Pillar 1: Simulates Avellaneda-Stoikov quoting during inventory imbalance', () => {
    const engine = new AvellanedaStoikovEngine();
    // When current position is long (+2), reservation price should drop below mid-price
    const quotes = engine.calculateQuotes(
      { midPrice: 100, volatility: 0.2, executionOrderDensity: 1.5, liquidityFactor: 140 },
      { currentPosition: 2, riskAversion: 0.1, terminalTime: 1.0, currentTime: 0 }
    );
    expect(quotes.reservationPrice).toBeLessThan(100);
    expect(quotes.optimalSpread).toBeGreaterThan(0);
    expect(quotes.optimalBid).toBeLessThan(quotes.reservationPrice);
    expect(quotes.optimalAsk).toBeGreaterThan(quotes.reservationPrice);
  });

  it('Pillar 2: Simulates CEX/DEX Basis Arbitrage with x*y=k curves', async () => {
    const calculator = new BasisCalculator();
    const cexOrderbook = {
      bids: [{ price: 105, size: 10 }],
      asks: [{ price: 106, size: 10 }],
      timestamp: Date.now(),
      feeTier: 0.001
    };
    const dexPool = {
      reserveBase: 1000,
      reserveQuote: 100000, // DEX price = 100
      feeTier: 0.003,
      timestamp: Date.now()
    };

    const opp = calculator.findBestOpportunity(
      cexOrderbook,
      dexPool,
      1.0, // gasCostUSD
      0.5, // minProfitUSD
      1.0  // tradeSize
    );

    expect(opp).not.toBeNull();
    expect(opp?.direction).toBe('DEX_TO_CEX');
    expect(opp?.netProfit).toBeGreaterThan(0);

    const executor = new CrossDomainExecutor();
    type TestableExecutor = {
      mockCexExecution: (opp: unknown) => Promise<{ success: boolean; orderId?: string }>;
      mockDexExecution: (opp: unknown) => Promise<{ success: boolean; txHash?: string }>;
    };
    const testable = executor as unknown as TestableExecutor;
    vi.spyOn(testable, 'mockCexExecution').mockResolvedValue({ success: true, orderId: 'mock-cex-id' });
    vi.spyOn(testable, 'mockDexExecution').mockResolvedValue({ success: true, txHash: '0xmockhash' });

    const result = await executor.execute(opp!);
    expect(result.success).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('Pillar 3: Simulates SABR Volatility Surface and Mispricing Scan', () => {
    const params = { alpha: 0.3, beta: 0.7, rho: -0.25, nu: 0.4 };
    const options: MarketOption[] = [
      {
        strike: 90,
        forward: 100,
        maturity: 0.5,
        marketIv: 0.40 // high market vol -> overvalued
      },
      {
        strike: 110,
        forward: 100,
        maturity: 0.5,
        marketIv: 0.20 // low market vol -> undervalued
      }
    ];

    const modelVols = options.map(o => computeSabrVol(o.forward, o.strike, o.maturity, params));
    expect(modelVols.length).toBe(2);

    const surfaceArb = scanVolatilitySurface(options, params, 0.02);
    expect(surfaceArb.length).toBe(2);
    expect(surfaceArb.some(a => a.isMispriced)).toBe(true);

    const price = black76('C', 100, 100, 0.5, 0.05, 0.3);
    expect(price).toBeGreaterThan(0);
  });
});
