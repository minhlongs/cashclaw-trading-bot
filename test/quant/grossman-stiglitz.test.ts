import { describe, it, expect } from 'vitest';
import { GrossmanStiglitzEngine } from '../../src/tree/quantlib/microstructure/grossman-stiglitz-engine';

describe('Grossman & Stiglitz (1980) Information Impossibility & Equilibrium Engine', () => {
  it('computes equilibrium informed fraction and price informativeness', () => {
    const config = {
      privateSignalCost: 0.1,
      riskTolerance: 1.0,
      fundamentalVariance: 1.0,
      noiseTradingVariance: 0.5,
    };
    const res = GrossmanStiglitzEngine.calculateEquilibrium(config);
    expect(res.equilibriumInformedFraction).toBeGreaterThan(0);
    expect(res.equilibriumInformedFraction).toBeLessThanOrEqual(1);
    expect(res.priceInformativeness).toBeGreaterThan(0);
    expect(res.priceInformativeness).toBeLessThan(1);
    expect(res.isInformationallyEfficient).toBe(false);
  });

  it('handles high information cost leading to zero informed fraction', () => {
    const config = {
      privateSignalCost: 5.0,
      riskTolerance: 0.5,
      fundamentalVariance: 1.0,
      noiseTradingVariance: 1.0,
    };
    const res = GrossmanStiglitzEngine.calculateEquilibrium(config);
    expect(res.equilibriumInformedFraction).toBe(0);
    expect(res.priceInformativeness).toBe(0);
    expect(res.isInformationallyEfficient).toBe(false);
  });

  it('throws error on non-positive parameters', () => {
    expect(() => {
      GrossmanStiglitzEngine.calculateEquilibrium({
        privateSignalCost: -0.1,
        riskTolerance: 1,
        fundamentalVariance: 1,
        noiseTradingVariance: 1,
      });
    }).toThrow('Invalid Grossman-Stiglitz parameters');
  });
});
