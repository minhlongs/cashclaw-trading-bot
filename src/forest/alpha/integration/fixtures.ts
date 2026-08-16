// Integration test fixtures — deterministic candle generators.
// No randomness: every call with the same parameters produces identical output.

export interface Candle {
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Generate n deterministic candles with optional trend + volatility. */
export function generateSyntheticCandles(
  n: number,
  trend: number = 0,
  volatility: number = 1,
  basePrice: number = 100,
  baseTs: number = 1_700_000_000_000,
): Candle[] {
  const candles: Candle[] = [];
  let close = basePrice;
  for (let i = 0; i < n; i++) {
    const drift = trend;
    const shock = volatility * (Math.sin(i * 1.3) + Math.cos(i * 0.7) * 0.5);
    const open = close;
    close = Math.max(close * 0.5, close + drift + shock);
    const high = close + volatility * Math.abs(Math.sin(i * 2.1)) * 0.5;
    const low = close - volatility * Math.abs(Math.cos(i * 1.9)) * 0.5;
    candles.push({
      timestamp: baseTs + i * 60_000,
      open,
      high: Math.max(high, close, open),
      low: Math.min(low, close, open),
      close,
      volume: 100 + Math.abs(Math.sin(i)) * 50,
    });
  }
  return candles;
}

/** Generate candles that switch between regimes at specified bar counts. */
export function generateSyntheticCandlesWithRegimes(
  regimePlan: { regime: string; bars: number }[],
): Candle[] {
  const candles: Candle[] = [];
  let ts = 1_700_000_000_000;
  let close = 100;
  for (const plan of regimePlan) {
    for (let i = 0; i < plan.bars; i++) {
      const trendMap: Record<string, number> = {
        TREND_UP: 0.3,
        TREND_DOWN: -0.3,
        RANGE: 0,
        HIGH_VOLATILITY: 0,
        LOW_VOLATILITY: 0,
        SHOCK: 0,
        UNKNOWN: 0,
      };
      const volMap: Record<string, number> = {
        TREND_UP: 0.5,
        TREND_DOWN: 0.5,
        RANGE: 1.0,
        HIGH_VOLATILITY: 5,
        LOW_VOLATILITY: 0.2,
        SHOCK: 10,
        UNKNOWN: 1,
      };
      const t = trendMap[plan.regime] ?? 0;
      const v = volMap[plan.regime] ?? 1;
      const open = close;
      const shock = v * (Math.sin(i * 1.3 + ts) + Math.cos(i * 0.7 + ts) * 0.5);
      close = Math.max(close * 0.5, close + t + shock);
      const high = close + v * Math.abs(Math.sin(i * 2.1)) * 0.5;
      const low = close - v * Math.abs(Math.cos(i * 1.9)) * 0.5;
      candles.push({
        timestamp: ts,
        open,
        high: Math.max(high, close, open),
        low: Math.min(low, close, open),
        close,
        volume: 100 + v * 10,
      });
      ts += 60_000;
    }
  }
  return candles;
}

/** Strong trend candles: monotonic rising or falling. */
export function generateTrendingCandles(n: number, direction: 'up' | 'down'): Candle[] {
  const trend = direction === 'up' ? 1.5 : -1.5;
  return generateSyntheticCandles(n, trend, 0.3, direction === 'up' ? 80 : 120);
}

/** Oscillating price (range-bound) candles. */
export function generateRangingCandles(n: number, amplitude: number = 2, frequency: number = 0.3): Candle[] {
  const candles: Candle[] = [];
  let ts = 1_700_000_000_000;
  let close = 100;
  for (let i = 0; i < n; i++) {
    const open = close;
    const sine = amplitude * Math.sin(i * frequency);
    close = open + sine * 0.1;
    const high = Math.max(close, open) + amplitude * 0.2;
    const low = Math.min(close, open) - amplitude * 0.2;
    candles.push({
      timestamp: ts,
      open,
      high,
      low,
      close,
      volume: 100,
    });
    ts += 60_000;
  }
  return candles;
}

/** High-volatility candles with large swings. */
export function generateHighVolCandles(n: number): Candle[] {
  return generateSyntheticCandles(n, 0, 8, 100);
}