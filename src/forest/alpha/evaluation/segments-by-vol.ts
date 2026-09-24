// Alpha Evaluation Report — Volatility bucket segmentation
// Builds the byVolBucket segment using per-candle volatility classification.

import type { BacktestTrade } from '@/forest/backtest/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { RegimeLabel } from '@/tree/regime/types';
import type { EvaluationReport } from './report-types';
import { classifyVol, reportFromTrades } from './report-helpers';

/** Build the byVolBucket segment using per-candle volatility classification. */
export function segmentByVolBucket(
  trades: BacktestTrade[],
  candles: Candle[],
  experimentId: string,
  symbol: string,
  timeframe: string,
  regime: RegimeLabel,
): Record<string, Partial<EvaluationReport>> {
  const volBuckets = classifyVol(candles);
  const volMap = new Map<string, BacktestTrade[]>();
  for (let i = 0; i < trades.length; i++) {
    const bucket = volBuckets[Math.min(i, volBuckets.length - 1)];
    const arr = volMap.get(bucket) ?? [];
    arr.push(trades[i]);
    volMap.set(bucket, arr);
  }
  const byVolBucket: Record<string, Partial<EvaluationReport>> = {};
  for (const [b, bTrades] of volMap) {
    byVolBucket[b] = reportFromTrades(bTrades, experimentId, symbol, timeframe, regime);
  }
  return byVolBucket;
}
