import type { Candle } from './fixtures-types';

const TREND_MAP: Record<string, number> = {
  TREND_UP: 0.3, TREND_DOWN: -0.3, RANGE: 0, HIGH_VOLATILITY: 0, LOW_VOLATILITY: 0, SHOCK: 0, UNKNOWN: 0,
};
const VOL_MAP: Record<string, number> = {
  TREND_UP: 0.5, TREND_DOWN: 0.5, RANGE: 1.0, HIGH_VOLATILITY: 5, LOW_VOLATILITY: 0.2, SHOCK: 10, UNKNOWN: 1,
};

export function generateSyntheticCandlesWithRegimes(regimePlan: { regime: string; bars: number }[]): Candle[] {
  const candles: Candle[] = [];
  let ts = 1_700_000_000_000, close = 100;
  for (const plan of regimePlan) {
    for (let i = 0; i < plan.bars; i++) {
      const t = TREND_MAP[plan.regime] ?? 0, v = VOL_MAP[plan.regime] ?? 1;
      const open = close, shock = v * (Math.sin(i * 1.3 + ts) + Math.cos(i * 0.7 + ts) * 0.5);
      close = Math.max(close * 0.5, close + t + shock);
      const high = close + v * Math.abs(Math.sin(i * 2.1)) * 0.5;
      const low = close - v * Math.abs(Math.cos(i * 1.9)) * 0.5;
      candles.push({ timestamp: ts, open, high: Math.max(high, close, open), low: Math.min(low, close, open), close, volume: 100 + v * 10 });
      ts += 60_000;
    }
  }
  return candles;
}
