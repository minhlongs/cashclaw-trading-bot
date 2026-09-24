// Alpha Evaluation Report — Duration segmentation
// Builds the byDuration segment from trade holding periods.

import type { BacktestTrade } from '@/forest/backtest/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { DurationBuckets } from './report-types';
import { durationBucket, reportFromTrades } from './report-helpers';

/** Build the byDuration segment from trade holding periods. */
export function segmentByDuration(
  trades: BacktestTrade[],
  experimentId: string,
  symbol: string,
  timeframe: string,
  regime: RegimeLabel,
): DurationBuckets {
  const dur = durationBucket(trades);
  return {
    short: reportFromTrades(dur.short, experimentId, symbol, timeframe, regime),
    medium: reportFromTrades(dur.medium, experimentId, symbol, timeframe, regime),
    long: reportFromTrades(dur.long, experimentId, symbol, timeframe, regime),
  };
}
