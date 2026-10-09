import { describe, expect, it } from 'vitest';
import { computeHoldenSubrahmanyamEquilibrium } from '../../src/tree/quantlib/microstructure/holden-subrahmanyam-engine';

describe('Holden-Subrahmanyam (1992) Risk-Averse Microstructure Auction Engine', () => {
  const baseParams = {
    numTraders: 3,
    numRounds: 5,
    priorVariance: 1.0,
    noiseVariance: 0.25,
    riskAversion: 0.5,
  };

  it('demonstrates monotonic decay in posterior uncertainty across auction rounds', () => {
    const res = computeHoldenSubrahmanyamEquilibrium(baseParams);
    expect(res.stages.length).toBe(5);
    for (let i = 1; i < res.stages.length; i++) {
      expect(res.stages[i]!.posteriorVariance).toBeLessThanOrEqual(res.stages[i - 1]!.posteriorVariance);
    }
    expect(res.totalInformationRevealed).toBeGreaterThan(0);
    expect(res.terminalUncertainty).toBeLessThan(baseParams.priorVariance);
  });

  it('increases market depth as more competing traders enter', () => {
    const resLow = computeHoldenSubrahmanyamEquilibrium({ ...baseParams, numTraders: 1 });
    const resHigh = computeHoldenSubrahmanyamEquilibrium({ ...baseParams, numTraders: 5 });
    expect(resHigh.totalInformationRevealed).toBeGreaterThanOrEqual(resLow.totalInformationRevealed);
  });

  it('dampens aggressive trading when risk aversion increases', () => {
    const resLowRisk = computeHoldenSubrahmanyamEquilibrium({ ...baseParams, riskAversion: 0.1 });
    const resHighRisk = computeHoldenSubrahmanyamEquilibrium({ ...baseParams, riskAversion: 2.0 });
    expect(resHighRisk.stages[0]!.beta).toBeLessThan(resLowRisk.stages[0]!.beta);
  });

  it('handles single round boundary condition correctly', () => {
    const res = computeHoldenSubrahmanyamEquilibrium({ ...baseParams, numRounds: 1 });
    expect(res.stages.length).toBe(1);
    expect(res.stages[0]!.round).toBe(1);
  });
});
