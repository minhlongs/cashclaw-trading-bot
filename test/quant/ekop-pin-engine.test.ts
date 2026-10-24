import { describe, it, expect } from 'vitest';
import { EkopPinEngine } from '../../src/tree/quantlib/microstructure/ekop-pin-engine';
import type { EkopTradeBucket } from '../../src/tree/quantlib/microstructure/ekop-pin-engine';

describe('EkopPinEngine', () => {
  const engine = new EkopPinEngine();

  it('throws error when fewer than 2 trade buckets are provided', () => {
    expect(() => engine.calculate([])).toThrow('EKOP PIN estimation requires at least 2 trade buckets.');
    expect(() => engine.calculate([{ buys: 10, sells: 10 }])).toThrow('EKOP PIN estimation requires at least 2 trade buckets.');
  });

  it('computes low PIN for symmetric balanced order flow (uninformed market)', () => {
    const buckets: EkopTradeBucket[] = [
      { buys: 100, sells: 100 },
      { buys: 105, sells: 95 },
      { buys: 98, sells: 102 },
      { buys: 100, sells: 100 },
      { buys: 102, sells: 98 },
    ];

    const result = engine.calculate(buckets);
    expect(result.pin).toBeLessThan(0.3);
    expect(result.alpha).toBeDefined();
    expect(result.mu).toBeDefined();
    expect(result.epsilon).toBeGreaterThan(0);
    expect(result.sampleBuckets).toBe(5);
  });

  it('computes high PIN for highly imbalanced order flow (informed trading activity)', () => {
    const buckets: EkopTradeBucket[] = [
      { buys: 500, sells: 10 },
      { buys: 480, sells: 12 },
      { buys: 520, sells: 15 },
      { buys: 510, sells: 8 },
    ];

    const result = engine.calculate(buckets);
    expect(result.pin).toBeGreaterThan(0.6);
    expect(result.mu).toBeGreaterThan(result.epsilon);
  });

  it('handles negative or zero trade counts gracefully via sanitization', () => {
    const buckets: EkopTradeBucket[] = [
      { buys: -10, sells: 0 },
      { buys: 0, sells: -5 },
      { buys: 0, sells: 0 },
    ];

    const result = engine.calculate(buckets);
    expect(result.pin).toBeGreaterThanOrEqual(0);
    expect(result.pin).toBeLessThanOrEqual(1);
    expect(result.sampleBuckets).toBe(3);
  });
});
