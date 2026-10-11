import { describe, it, expect } from 'vitest';
import { computeGlostenMilgromSpread } from '../../src/tree/quantlib/microstructure/glosten-milgrom-engine';

describe('Glosten & Milgrom (1985) Asymmetric Information Spread Engine', () => {
  it('updates posterior belief upwards upon buy trades', () => {
    const res = computeGlostenMilgromSpread({
      vLow: 90,
      vHigh: 110,
      priorHighProb: 0.5,
      informedProb: 0.3,
      tradeSequence: ['buy', 'buy', 'buy'],
    });

    expect(res.quotes).toHaveLength(3);
    expect(res.finalProb).toBeGreaterThan(0.5);
    expect(res.quotes[0]!.ask).toBeGreaterThan(res.quotes[0]!.bid);
    expect(res.quotes[1]!.ask).toBeGreaterThan(res.quotes[0]!.ask);
    expect(res.averageSpread).toBeGreaterThan(0);
    expect(res.adverseSelectionBps).toBeGreaterThan(0);
  });

  it('updates posterior belief downwards upon sell trades', () => {
    const res = computeGlostenMilgromSpread({
      vLow: 80,
      vHigh: 120,
      priorHighProb: 0.5,
      informedProb: 0.25,
      tradeSequence: ['sell', 'sell'],
    });

    expect(res.finalProb).toBeLessThan(0.5);
    expect(res.quotes[1]!.bid).toBeLessThan(res.quotes[0]!.bid);
  });

  it('widens the spread when fraction of informed traders increases', () => {
    const lowInformed = computeGlostenMilgromSpread({
      vLow: 90,
      vHigh: 110,
      priorHighProb: 0.5,
      informedProb: 0.05,
      tradeSequence: ['buy'],
    });
    const highInformed = computeGlostenMilgromSpread({
      vLow: 90,
      vHigh: 110,
      priorHighProb: 0.5,
      informedProb: 0.40,
      tradeSequence: ['buy'],
    });

    expect(highInformed.averageSpread).toBeGreaterThan(lowInformed.averageSpread);
  });
});
