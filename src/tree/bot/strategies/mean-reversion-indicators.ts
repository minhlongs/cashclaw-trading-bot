// Mean Reversion — indicator calculations (extracted for size compliance)
// Bollinger Bands, RSI, volume check.
// Canonical implementations from alpha/indicators; strategy-specific thresholds kept here.

import { bollingerBands, computeRSI } from '../../alpha/indicators';

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
}

export interface RSI {
  value: number;
  trend: 'oversold' | 'neutral' | 'overbought';
}

export function calculateBB(prices: number[], period: number, stdDev: number): BollingerBands {
  const bb = bollingerBands(prices, period, stdDev);
  if (!bb) return { upper: 0, middle: 0, lower: 0 };
  return { upper: bb.upper, middle: bb.middle, lower: bb.lower };
}

export function calculateRSI(
  prices: number[],
  period: number,
  buyThreshold: number,
  sellThreshold: number,
): RSI {
  const rsiValue = computeRSI(prices, period);
  if (rsiValue === null) return { value: 50, trend: 'neutral' };

  let trend: 'oversold' | 'neutral' | 'overbought' = 'neutral';
  if (rsiValue <= buyThreshold) trend = 'oversold';
  else if (rsiValue >= sellThreshold) trend = 'overbought';

  return { value: rsiValue, trend };
}

export function checkVolume(volumes: number[], period: number, multiplier: number): boolean {
  if (volumes.length < period) return false;
  const recentVol = volumes[volumes.length - 1];
  const avgVol = volumes.slice(-period).reduce((a, b) => a + b, 0) / period;
  return recentVol >= avgVol * multiplier;
}
