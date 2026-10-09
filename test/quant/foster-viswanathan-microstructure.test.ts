import { describe, it, expect } from 'vitest';
import { computeFosterViswanathanEquilibrium } from '@/tree/quantlib/microstructure/foster-viswanathan-engine';
import type { FosterViswanathanParams } from '@/tree/quantlib/microstructure/foster-viswanathan-types';

describe('Foster-Viswanathan (1993) Multi-Informed Microstructure Engine', () => {
  const baseParams: FosterViswanathanParams = {
    numTraders: 3,
    numRounds: 5,
    priorVariance: 1.0,
    noiseVariance: 0.25,
    signalCorrelation: 0.5,
  };

  it('computes equilibrium stages revealing information monotonically', () => {
    const res = computeFosterViswanathanEquilibrium(baseParams);
    expect(res.stages.length).toBe(5);

    // Posterior variance must monotonically decrease
    for (let i = 1; i < res.stages.length; i++) {
      expect(res.stages[i].posteriorVariance).toBeLessThanOrEqual(res.stages[i - 1].posteriorVariance);
    }
    expect(res.totalInformationRevealed).toBeGreaterThan(0);
    expect(res.terminalUncertainty).toBeLessThan(baseParams.priorVariance);
    expect(res.averageMarketDepth).toBeGreaterThan(0);
  });

  it('increases informed trading competition when trader count increases', () => {
    const duopoly = computeFosterViswanathanEquilibrium({ ...baseParams, numTraders: 2 });
    const cartel = computeFosterViswanathanEquilibrium({ ...baseParams, numTraders: 6 });

    // With more competing traders, terminal uncertainty drops faster
    expect(cartel.terminalUncertainty).toBeLessThanOrEqual(duopoly.terminalUncertainty);
    expect(cartel.totalInformationRevealed).toBeGreaterThanOrEqual(duopoly.totalInformationRevealed);
  });

  it('handles zero or single round edge cases gracefully', () => {
    const singleRound = computeFosterViswanathanEquilibrium({ ...baseParams, numRounds: 1 });
    expect(singleRound.stages.length).toBe(1);
    expect(singleRound.stages[0].round).toBe(1);
    expect(singleRound.stages[0].beta).toBeGreaterThan(0);
    expect(singleRound.stages[0].lambda).toBeGreaterThan(0);
  });

  it('handles uncorrelated independent signals (rho = 0)', () => {
    const indep = computeFosterViswanathanEquilibrium({ ...baseParams, signalCorrelation: 0 });
    expect(indep.stages.length).toBe(5);
    expect(indep.totalInformationRevealed).toBeGreaterThan(0);
  });
});
