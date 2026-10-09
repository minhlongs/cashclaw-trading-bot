import type { Candle } from '@/forest/backtest/ohlcv';
import type { BarrierConfig, BarrierLabel, LabeledEvent } from './labeling-types';
import { evaluateForwardBarrier } from './labeling-barrier-evaluator';

export type { BarrierConfig, BarrierLabel, LabeledEvent };

export function labelEvent(
  candles: readonly Candle[],
  entryIdx: number,
  config: BarrierConfig,
): LabeledEvent | null {
  if (entryIdx < 0 || entryIdx >= candles.length) return null;
  const entryCandle = candles[entryIdx];
  if (!entryCandle || entryCandle.close <= 0) return null;

  return evaluateForwardBarrier(candles, entryIdx, config);
}
