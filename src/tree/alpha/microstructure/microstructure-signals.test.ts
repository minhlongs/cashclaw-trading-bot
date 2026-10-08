import { describe, it, expect } from 'vitest';
import { deriveMicrostructureSignal } from './microstructure-signals';

describe('Microstructure Signals Synthesizer', () => {
  it('yields neutral signal when OFI is within noise bounds', () => {
    const signal = deriveMicrostructureSignal(
      { ofi: 0.05, normalizedOfi: 0.05, timestampMs: 1000 },
      { vpin: 0.2, sampleBucketsCount: 5, isToxic: false, timestampMs: 1000 },
      0.2,
    );
    expect(signal.compositeDirection).toBe('neutral');
    expect(signal.confidence).toBe(0);
  });

  it('boosts buy confidence when OFI is bullish and VPIN signals toxicity', () => {
    const signal = deriveMicrostructureSignal(
      { ofi: 0.5, normalizedOfi: 0.5, timestampMs: 1000 },
      { vpin: 0.7, sampleBucketsCount: 5, isToxic: true, timestampMs: 1000 },
      0.2,
    );
    expect(signal.compositeDirection).toBe('buy');
    expect(signal.confidence).toBeCloseTo(0.5 * 1.3, 4); // Boosted
  });

  it('yields sell signal on negative OFI', () => {
    const signal = deriveMicrostructureSignal(
      { ofi: -0.4, normalizedOfi: -0.4, timestampMs: 1000 },
      { vpin: 0.1, sampleBucketsCount: 5, isToxic: false, timestampMs: 1000 },
      0.2,
    );
    expect(signal.compositeDirection).toBe('sell');
    expect(signal.confidence).toBeCloseTo(0.4, 4);
  });
});
