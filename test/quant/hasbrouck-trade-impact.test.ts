import { describe, it, expect } from 'vitest';
import { computeHasbrouckTradeImpact } from '@/tree/quantlib/microstructure/hasbrouck-trade-impact-engine';

describe('Hasbrouck (1991) Trade Impact Engine', () => {
  it('estimates positive permanent price impact and information share from correlated series', () => {
    const innovations = [1.0, -0.5, 2.0, -1.0, 0.5];
    const returns = [0.002, -0.001, 0.003, -0.0015, 0.0008];
    const res = computeHasbrouckTradeImpact({ tradeInnovations: innovations, returns });
    expect(res.permanentImpact).toBeGreaterThan(0);
    expect(res.informationShare).toBeGreaterThan(0);
    expect(res.informationShare).toBeLessThanOrEqual(1);
  });
});
