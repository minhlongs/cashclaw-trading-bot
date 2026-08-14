// Mean Reversion — indicator calculations (extracted for size compliance)
// Bollinger Bands, RSI, volume check.

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
  const window = prices.slice(-period);
  const middle = window.reduce((a, b) => a + b, 0) / window.length;
  const variance = window.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / window.length;
  const std = Math.sqrt(variance);

  return {
    upper: middle + stdDev * std,
    middle,
    lower: middle - stdDev * std,
  };
}

export function calculateRSI(
  prices: number[],
  period: number,
  buyThreshold: number,
  sellThreshold: number,
): RSI {
  const window = prices.slice(-period - 1);
  if (window.length < period + 1) return { value: 50, trend: 'neutral' };

  let gains = 0;
  let losses = 0;
  for (let i = window.length - period; i < window.length; i++) {
    const change = window[i] - window[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return { value: 100, trend: 'overbought' };

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  let trend: 'oversold' | 'neutral' | 'overbought' = 'neutral';
  if (rsi <= buyThreshold) trend = 'oversold';
  else if (rsi >= sellThreshold) trend = 'overbought';

  return { value: rsi, trend };
}

export function checkVolume(volumes: number[], period: number, multiplier: number): boolean {
  if (volumes.length < period) return false;
  const recentVol = volumes[volumes.length - 1];
  const avgVol = volumes.slice(-period).reduce((a, b) => a + b, 0) / period;
  return recentVol >= avgVol * multiplier;
}
