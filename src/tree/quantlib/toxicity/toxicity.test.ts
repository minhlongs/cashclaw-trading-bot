import { describe, it, expect } from 'vitest';
import { initializeVpinState, updateContinuousVpin } from './continuous-vpin-streamer';
import { estimateHawkesIntensity, detectWhaleSweep } from './hawkes-process-detector';
import type { HawkesPointEvent, HawkesProcessModel } from './toxicity-types';

describe('Microstructure Toxicity & Hawkes Desk', () => {
  it('updates VPIN progressively across buckets', () => {
    let state = initializeVpinState();
    // Fill half a bucket, completely balanced
    state = updateContinuousVpin(state, 25, 25, 100, 50);
    expect(state.bucketCount).toBe(0);
    
    // Fill beyond bucket, highly unbalanced (mostly buys)
    state = updateContinuousVpin(state, 60, 5, 100, 50);
    expect(state.bucketCount).toBe(1);
    expect(state.historicalVpins).toHaveLength(1);
    
    // Fill another heavily imbalanced bucket
    state = updateContinuousVpin(state, 100, 0, 100, 50);
    expect(state.bucketCount).toBe(2);
    expect(state.currentVpin).toBeGreaterThan(0.5);
  });

  it('calculates Hawkes intensity with exponential decay excitation', () => {
    const model: HawkesProcessModel = { baselineIntensityMu: 0.5, jumpExcitationAlpha: 1.0, decayRateBeta: 1.0 };
    const now = 10000;
    const events: HawkesPointEvent[] = [
      { timestampMs: 9000, magnitude: 1.0, side: 'buy' }, // 1s ago -> e^-1 ~ 0.36
      { timestampMs: 9500, magnitude: 2.0, side: 'buy' }, // 0.5s ago -> e^-0.5 ~ 0.60 * 2 = 1.2
    ];
    
    const est = estimateHawkesIntensity(events, model, now, 2.0);
    // Baseline 0.5 + 0.36 + 1.21 = 2.07
    expect(est.currentIntensity).toBeGreaterThan(1.5);
    expect(est.currentIntensity).toBeLessThan(2.5);
    expect(est.selfExcitedProbability).toBeGreaterThan(0.6);
  });

  it('triggers Whale Sweep signal during burst', () => {
    const model: HawkesProcessModel = { baselineIntensityMu: 0.1, jumpExcitationAlpha: 2.0, decayRateBeta: 0.5 };
    const now = 10000;
    // Massive sequence of sells in last 500ms
    const events: HawkesPointEvent[] = [
      { timestampMs: 9600, magnitude: 5.0, side: 'sell' },
      { timestampMs: 9800, magnitude: 8.0, side: 'sell' },
      { timestampMs: 9900, magnitude: 10.0, side: 'sell' },
    ];
    
    const intensity = estimateHawkesIntensity(events, model, now, 5.0);
    expect(intensity.isBursting).toBe(true);

    const sweep = detectWhaleSweep(events, intensity, 3000);
    expect(sweep.detected).toBe(true);
    expect(sweep.dominantSide).toBe('sell');
    expect(sweep.estimatedSweepSizeVol).toBe(23.0);
  });

  it('does not trigger sweep when intensity is below threshold', () => {
    const intensity = {
      timestampMs: 1000,
      currentIntensity: 1.0,
      backgroundProbability: 1.0,
      selfExcitedProbability: 0.0,
      isBursting: false
    };
    const sweep = detectWhaleSweep([], intensity);
    expect(sweep.detected).toBe(false);
  });
});
