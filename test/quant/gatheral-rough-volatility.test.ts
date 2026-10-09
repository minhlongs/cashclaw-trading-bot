import { describe, it, expect } from 'vitest';
import { GatheralRoughVolatilityEngine } from '../../src/tree/quantlib/volatility/gatheral-rough-volatility';

describe('GatheralRoughVolatilityEngine', () => {
  it('returns default H=0.5 when sample size is insufficient', () => {
    const engine = new GatheralRoughVolatilityEngine({ minObservations: 20 });
    const result = engine.estimateHurst([0.1, 0.2, 0.3]);
    expect(result.hurstExponent).toBe(0.5);
    expect(result.isRoughRegime).toBe(false);
    expect(result.sampleCount).toBe(3);
  });

  it('detects rough volatility regime (H < 0.45) for high-frequency rugged series', () => {
    const engine = new GatheralRoughVolatilityEngine({
      minObservations: 15,
      maxLag: 5,
      roughThreshold: 0.45,
    });
    // Create synthetic series with rapid anti-persistent oscillations (low H)
    const series: number[] = [];
    let val = 1.0;
    for (let i = 0; i < 40; i++) {
      val += (i % 2 === 0 ? 0.05 : -0.048) * (1 + (i % 3) * 0.1);
      series.push(val);
    }
    const result = engine.estimateHurst(series);
    expect(result.hurstExponent).toBeLessThan(0.45);
    expect(result.isRoughRegime).toBe(true);
    expect(result.sampleCount).toBe(40);
  });

  it('accurately distinguishes persistent series from rough regime', () => {
    const engine = new GatheralRoughVolatilityEngine({
      minObservations: 15,
      maxLag: 4,
      roughThreshold: 0.4,
    });
    // Persistent linear upward drift
    const persistentSeries: number[] = Array.from({ length: 30 }, (_, i) => 1.0 + i * 0.05);
    const result = engine.estimateHurst(persistentSeries);
    expect(result.hurstExponent).toBeGreaterThan(0.4);
    expect(result.isRoughRegime).toBe(false);
  });
});
