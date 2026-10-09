import type { Candle } from '@/forest/backtest/ohlcv';
import type { BarrierConfig, LabeledEvent } from './labeling-types';

function buildEvent(
  entryPrice: number,
  exitPrice: number,
  entryTs: number,
  exitTs: number,
  label: 1 | -1 | 0,
): LabeledEvent {
  return {
    entryTimestamp: entryTs,
    exitTimestamp: exitTs,
    label,
    entryPrice,
    exitPrice,
    pnl: exitPrice - entryPrice,
    duration: exitTs - entryTs,
  };
}

export function evaluateForwardBarrier(
  candles: readonly Candle[],
  entryIdx: number,
  config: BarrierConfig,
): LabeledEvent | null {
  const entryCandle = candles[entryIdx]!;
  const entryPrice = entryCandle.close;
  const entryTs = entryCandle.timestamp;
  const tp = config.takeProfitPct;
  const sl = config.stopLossPct;
  let lastCandle = entryCandle;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i]!;
    if (c.timestamp - entryTs > config.maxHoldingMs) {
      return buildEvent(entryPrice, lastCandle.close, entryTs, lastCandle.timestamp, 0);
    }

    const tpHit = (c.high - entryPrice) / entryPrice >= tp;
    const slHit = (entryPrice - c.low) / entryPrice >= sl;

    if (tpHit && slHit) {
      return buildEvent(entryPrice, entryCandle.close, entryTs, c.timestamp, 0);
    }
    if (tpHit) {
      return buildEvent(entryPrice, entryPrice * (1 + tp), entryTs, c.timestamp, 1);
    }
    if (slHit) {
      return buildEvent(entryPrice, entryPrice * (1 - sl), entryTs, c.timestamp, -1);
    }
    lastCandle = c;
  }
  return null;
}
