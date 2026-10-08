import { test, expect, describe } from 'vitest';
import { computeSabrVol, SabrParams } from '../../src/quant/sabr-engine';

describe('SABR Engine', () => {
  const defaultParams: SabrParams = {
    alpha: 0.2, // normal volatility
    beta: 0.5,  // CEV model halfway between normal and lognormal
    rho: -0.2,  // leverage effect, negative correlation
    nu: 0.3     // vol of vol
  };
  
  test('computeSabrVol handles ATM correctly', () => {
    // K = f exactly
    const volExactAtm = computeSabrVol(100, 100, 1.0, defaultParams);
    
    // K extremely close to f
    const volCloseAtm = computeSabrVol(100, 100.0000001, 1.0, defaultParams);
    
    expect(volExactAtm).toBeCloseTo(volCloseAtm, 4);
    expect(volExactAtm).toBeGreaterThan(0);
  });
  
  test('computeSabrVol generates a smile/skew', () => {
    const volAtm = computeSabrVol(100, 100, 1.0, defaultParams);
    const volOtm = computeSabrVol(100, 110, 1.0, defaultParams);
    const volItm = computeSabrVol(100, 90, 1.0, defaultParams);
    
    // In typical equity models with negative rho, ITM puts (low strikes) have higher vol
    expect(volItm).toBeGreaterThan(volAtm);
    
  });

  test('computeSabrVol handles z=0 safely', () => {
    // When z ~ 0 but f != k, it should not divide by zero
    // For nu very small and alpha large, z approaches 0
    const params: SabrParams = { ...defaultParams, alpha: 0.5, nu: 0.0001 };
    const vol = computeSabrVol(100, 105, 1.0, params);
    expect(vol).toBeGreaterThan(0);
  });

  test('computeSabrVol throws on invalid inputs', () => {
    expect(() => computeSabrVol(0, 100, 1.0, defaultParams)).toThrow(/positive/);
    expect(() => computeSabrVol(100, -10, 1.0, defaultParams)).toThrow(/positive/);
    expect(() => computeSabrVol(100, 100, -1.0, defaultParams)).toThrow(/maturity/);
    expect(() => computeSabrVol(100, 100, 1.0, { ...defaultParams, beta: 1.5 })).toThrow(/Beta/);
    expect(() => computeSabrVol(100, 100, 1.0, { ...defaultParams, rho: 2 })).toThrow(/Rho/);
    expect(() => computeSabrVol(100, 100, 1.0, { ...defaultParams, nu: 0 })).toThrow(/strictly positive/);
    expect(() => computeSabrVol(100, 100, 1.0, { ...defaultParams, alpha: -0.1 })).toThrow(/Alpha/);
  });
});
