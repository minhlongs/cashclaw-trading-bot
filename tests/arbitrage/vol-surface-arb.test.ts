import { test, expect, describe } from 'vitest';
import { scanVolatilitySurface, MarketOption } from '../../src/arbitrage/vol-surface-arb';
import { SabrParams } from '../../src/quant/sabr-engine';

describe('Volatility Surface Arbitrage Scanner', () => {
  const sabrParams: SabrParams = {
    alpha: 0.2,
    beta: 0.5,
    rho: -0.2,
    nu: 0.3
  };

  test('scanVolatilitySurface identifies mispriced options', () => {
    
    // sabrIv is ~0.020 for ATM (100), ~0.028 for ITM (90),  ~0.022 for OTM (110)
    const options: MarketOption[] = [
      { strike: 90, maturity: 1.0, forward: 100, marketIv: 0.001 }, // sabrIv ~0.028, delta ~ -0.027, should be BUY_MARKET
      { strike: 100, maturity: 1.0, forward: 100, marketIv: 0.020138 }, // near exact sabrIv, delta ~ 0, NONE
      { strike: 110, maturity: 1.0, forward: 100, marketIv: 0.10 }, // sabrIv ~0.022, delta ~ 0.078, should be SELL_MARKET
    ];
    
    const results = scanVolatilitySurface(options, sabrParams, 0.01); // 1% threshold
    
    expect(results.length).toBe(3);
    
    expect(results[0].strike).toBe(90);
    expect(results[0].action).toBe('BUY_MARKET');
    expect(results[0].isMispriced).toBe(true);
    
    expect(results[1].strike).toBe(100);
    expect(results[1].action).toBe('NONE');
    expect(results[1].isMispriced).toBe(false);
    
    expect(results[2].strike).toBe(110);
    expect(results[2].action).toBe('SELL_MARKET');
    expect(results[2].isMispriced).toBe(true);
  });
});
