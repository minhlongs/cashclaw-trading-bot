import { describe, it, expect } from 'vitest';
import {
  computeExpectedMaxSharpe,
  computeDeflatedSharpe,
} from './deflated-sharpe';

describe('Deflated Sharpe Ratio (DSR)', () => {
  it('increases expected maximum Sharpe as number of trials grows', () => {
    const max1 = computeExpectedMaxSharpe(1);
    const max10 = computeExpectedMaxSharpe(10);
    const max100 = computeExpectedMaxSharpe(100);

    expect(max1).toBe(0);
    expect(max10).toBeGreaterThan(0);
    expect(max100).toBeGreaterThan(max10);
  });

  it('rejects a modest Sharpe ratio when tested across hundreds of trials', () => {
    // Sharpe = 1.2 might look good on 1 trial, but after 500 trials it is likely noise
    const resSingle = computeDeflatedSharpe({
      estimatedSharpe: 1.2,
      sampleLength: 252,
      numTrials: 1,
    });
    expect(resSingle.isSignificant).toBe(true);

    const res500 = computeDeflatedSharpe({
      estimatedSharpe: 1.2,
      sampleLength: 252,
      numTrials: 500,
    });
    // With 500 trials, Sharpe 1.2 is no longer statistically significant
    expect(res500.isSignificant).toBe(false);
  });

  it('recognizes an exceptionally high Sharpe ratio even under multiple testing', () => {
    const resElite = computeDeflatedSharpe({
      estimatedSharpe: 3.5,
      sampleLength: 500,
      numTrials: 500,
    });
    expect(resElite.isSignificant).toBe(true);
    expect(resElite.deflatedSharpeRatio).toBeGreaterThan(0.95);
  });

  it('handles edge cases gracefully', () => {
    const zeroLen = computeDeflatedSharpe({
      estimatedSharpe: 1.5,
      sampleLength: 0,
      numTrials: 10,
    });
    expect(zeroLen.isSignificant).toBe(false);
    expect(zeroLen.deflatedSharpeRatio).toBe(0);
  });
});
