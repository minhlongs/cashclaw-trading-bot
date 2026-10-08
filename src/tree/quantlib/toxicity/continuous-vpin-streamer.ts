/**
 * @file continuous-vpin-streamer.ts
 * @description Continuous sliding window Volume-Synchronized Probability of Informed Trading (VPIN).
 */

import type { ContinuousVpinState } from './toxicity-types';

export function initializeVpinState(): ContinuousVpinState {
  return {
    currentBucketVolume: 0,
    absoluteImbalance: 0,
    bucketCount: 0,
    historicalVpins: [],
    currentVpin: 0.0,
    thresholdCdf: 0.0,
  };
}

export function updateContinuousVpin(
  state: ContinuousVpinState,
  buyVolume: number,
  sellVolume: number,
  bucketVolumeTarget = 100,
  movingWindowSize = 50,
): ContinuousVpinState {
  const tradeVol = buyVolume + sellVolume;
  const imbalance = Math.abs(buyVolume - sellVolume);
  
  if (tradeVol === 0) return state;

  let newBucketVol = state.currentBucketVolume + tradeVol;
  let newImbalance = state.absoluteImbalance + imbalance;
  let newBucketCount = state.bucketCount;
  const hist = [...state.historicalVpins];
  let vpin = state.currentVpin;

  // Process completed buckets
  while (newBucketVol >= bucketVolumeTarget && bucketVolumeTarget > 0) {
    const fraction = bucketVolumeTarget / newBucketVol;
    const bucketImbalance = newImbalance * fraction;
    
    // Add VPIN metric (Imbalance / Volume) for this bucket
    hist.push(bucketImbalance / bucketVolumeTarget);
    if (hist.length > movingWindowSize) {
      hist.shift();
    }
    
    newBucketCount++;
    newBucketVol -= bucketVolumeTarget;
    newImbalance -= bucketImbalance;
  }

  // Recalculate VPIN over the window
  if (hist.length > 0) {
    const sum = hist.reduce((a, b) => a + b, 0);
    vpin = sum / hist.length;
  }

  // Determine baseline statistics. If we don't have enough history, use sensible defaults for a low-volatility market
  const avg = hist.length > 5 ? hist.reduce((a, b) => a + b, 0) / hist.length : 0.25;
  const variance = hist.length > 5 ? hist.reduce((a, b) => a + (b - avg)**2, 0) / (hist.length - 1) : 0.01;
  const stdDesc = Math.max(Math.sqrt(variance), 0.01);
  const z = (vpin - avg) / stdDesc;
  // Approximation of normal CDF
  const cdf = 1.0 / (1.0 + Math.exp(-1.702 * z));

  return {
    currentBucketVolume: newBucketVol,
    absoluteImbalance: newImbalance,
    bucketCount: newBucketCount,
    historicalVpins: hist,
    currentVpin: Math.round(vpin * 1e4) / 1e4,
    thresholdCdf: Math.round(cdf * 1e4) / 1e4,
  };
}
