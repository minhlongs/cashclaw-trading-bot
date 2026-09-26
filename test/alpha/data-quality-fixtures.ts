import type { Candle } from '@/tree/alpha/data-quality';

export const BASE_TIMESTAMP = 1_700_000_000_000;
export const DEFAULT_STEP_MS = 60_000;

export function createBaseCandle(overrides?: Partial<Candle>): Candle {
  return {
    timestamp: BASE_TIMESTAMP,
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
    ...overrides,
  };
}

export function generateMonotonicCandles(
  count: number,
  startTs: number = BASE_TIMESTAMP,
  stepMs: number = DEFAULT_STEP_MS,
  basePrice: number = 100,
): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = basePrice + (i % 5) * 2;
    const close = open + (i % 2 === 0 ? 1.5 : -1.5);
    candles.push({
      timestamp: startTs + i * stepMs,
      open,
      high: Math.max(open, close) + 3.0,
      low: Math.min(open, close) - 3.0,
      close,
      volume: 1000 + (i % 7) * 50,
    });
  }
  return candles;
}

export function generateDuplicateSeries(
  count: number,
  firstIndex: number = 1,
  secondIndex: number = 2,
): Candle[] {
  const candles = generateMonotonicCandles(count);
  if (candles.length > secondIndex && candles.length > firstIndex) {
    candles[secondIndex] = { ...candles[secondIndex], timestamp: candles[firstIndex].timestamp };
  }
  return candles;
}

export function generateGappedSeries(
  count: number,
  gapIndex: number = 2,
  gapMultiplier: number = 3,
  stepMs: number = DEFAULT_STEP_MS,
): Candle[] {
  const candles = generateMonotonicCandles(count, BASE_TIMESTAMP, stepMs);
  const gapOffset = (gapMultiplier - 1) * stepMs;
  for (let i = gapIndex; i < candles.length; i++) {
    candles[i] = { ...candles[i], timestamp: candles[i].timestamp + gapOffset };
  }
  return candles;
}

export type CorruptedOHLCType =
  | 'high_lt_low'
  | 'high_lt_oc'
  | 'low_gt_oc'
  | 'negative_price'
  | 'zero_price'
  | 'nan_price';

export function generateCorruptedOHLCSeries(
  type: CorruptedOHLCType,
  targetIndex: number = 2,
  count: number = 5,
): Candle[] {
  const candles = generateMonotonicCandles(count);
  const target = candles[targetIndex] ?? candles[0];
  const map: Record<CorruptedOHLCType, Candle> = {
    high_lt_low: { ...target, high: 80, low: 90 },
    high_lt_oc: { ...target, high: 99, open: 100, close: 102 },
    low_gt_oc: { ...target, low: 103, open: 100, close: 102 },
    negative_price: { ...target, low: -5 },
    zero_price: { ...target, open: 0, low: 0 },
    nan_price: { ...target, high: Number.NaN },
  };
  candles[targetIndex] = map[type];
  return candles;
}

export type VolumeAnomalyType =
  | 'negative'
  | 'isolated_zero'
  | 'consecutive_zeros'
  | 'nan_volume';

export function generateVolumeAnomalySeries(
  type: VolumeAnomalyType,
  count: number = 5,
): Candle[] {
  const candles = generateMonotonicCandles(count);
  if (type === 'negative') candles[2] = { ...candles[2], volume: -100 };
  else if (type === 'isolated_zero') candles[2] = { ...candles[2], volume: 0 };
  else if (type === 'consecutive_zeros') {
    candles[1] = { ...candles[1], volume: 0 };
    candles[2] = { ...candles[2], volume: 0 };
    candles[3] = { ...candles[3], volume: 0 };
  } else if (type === 'nan_volume') {
    candles[2] = { ...candles[2], volume: Number.NaN };
  }
  return candles;
}

export function generateMultiFeedPairs(
  count: number,
  options?: {
    readonly driftMs?: number;
    readonly dropSecondaryIndex?: number;
    readonly secondarySkewMs?: number;
  },
): { readonly primary: Candle[]; readonly secondary: Candle[] } {
  const primary = generateMonotonicCandles(count);
  const secondary: Candle[] = [];
  for (let i = 0; i < count; i++) {
    if (options?.dropSecondaryIndex !== undefined && i === options.dropSecondaryIndex) continue;
    const skew = (options?.secondarySkewMs ?? 0) + (options?.driftMs ? i * options.driftMs : 0);
    secondary.push({
      ...primary[i],
      timestamp: primary[i].timestamp + skew,
      open: primary[i].open + 0.1,
      close: primary[i].close + 0.1,
    });
  }
  return { primary, secondary };
}

export function generateOutageSeries(
  count: number,
  streakLength: number = 3,
  startIndex: number = 1,
): Candle[] {
  const candles = generateMonotonicCandles(count);
  const template = candles[startIndex];
  for (let i = startIndex + 1; i < startIndex + streakLength && i < candles.length; i++) {
    candles[i] = { ...template, timestamp: candles[i].timestamp };
  }
  return candles;
}

export function generateStaleSeries(
  count: number,
  asOf: number,
  stalenessMs: number,
  stepMs: number = DEFAULT_STEP_MS,
): Candle[] {
  const latestTs = asOf - stalenessMs;
  return generateMonotonicCandles(count, latestTs - (count - 1) * stepMs, stepMs);
}

export function generateFutureSeries(
  count: number,
  asOf: number,
  lookaheadMs: number = DEFAULT_STEP_MS,
  stepMs: number = DEFAULT_STEP_MS,
): Candle[] {
  const latestTs = asOf + lookaheadMs;
  return generateMonotonicCandles(count, latestTs - (count - 1) * stepMs, stepMs);
}
