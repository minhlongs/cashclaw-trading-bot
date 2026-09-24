// Alpha Evaluation Report — Month segmentation
// Builds the byMonth segment from trade timestamps.

import type { BacktestTrade } from '@/forest/backtest/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { EvaluationReport } from './report-types';
import { monthKey, reportFromTrades } from './report-helpers';

/** Build the byMonth segment from trade timestamps. */
export function segmentByMonth(
  trades: BacktestTrade[],
  experimentId: string,
  symbol: string,
  timeframe: string,
  regime: RegimeLabel,
): Record<string, Partial<EvaluationReport>> {
  const monthMap = new Map<string, BacktestTrade[]>();
  for (const t of trades) {
    const key = monthKey(t.entryTimestamp);
    const arr = monthMap.get(key) ?? [];
    arr.push(t);
    monthMap.set(key, arr);
  }
  const byMonth: Record<string, Partial<EvaluationReport>> = {};
  for (const [m, mTrades] of monthMap) {
    byMonth[m] = reportFromTrades(mTrades, experimentId, symbol, timeframe, regime);
  }
  return byMonth;
}