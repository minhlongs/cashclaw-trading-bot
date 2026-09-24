// Alpha Evaluation Report — Regime segmentation
// Builds the byRegime segment (single regime for the run).

import type { BacktestTrade } from '@/forest/backtest/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { EvaluationReport } from './report-types';
import { reportFromTrades } from './report-helpers';

/** Build the byRegime segment (single regime for the run). */
export function segmentByRegime(
  trades: BacktestTrade[],
  experimentId: string,
  symbol: string,
  timeframe: string,
  regime: RegimeLabel,
): Record<RegimeLabel, Partial<EvaluationReport>> {
  const byRegime: Record<RegimeLabel, Partial<EvaluationReport>> = {} as Record<
    RegimeLabel, Partial<EvaluationReport>
  >;
  byRegime[regime] = reportFromTrades(trades, experimentId, symbol, timeframe, regime);
  return byRegime;
}
