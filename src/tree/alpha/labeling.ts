// Alpha Lab — Triple-Barrier Event Labeling
// Pure function that labels candle events using take-profit, stop-loss, and timeout barriers.

import type { Candle } from '@/forest/backtest/ohlcv';

// ── Types ────────────────────────────────────────────────────────────────────

/** Barrier thresholds for labeling. */
export interface BarrierConfig {
  /** Take-profit trigger (e.g. 0.02 = 2%). */
  readonly takeProfitPct: number;
  /** Stop-loss trigger (e.g. 0.01 = 1%). */
  readonly stopLossPct: number;
  /** Max holding time in milliseconds before timeout. */
  readonly maxHoldingMs: number;
}

/** Label outcome: 1 = TP hit, -1 = SL hit, 0 = timeout or ambiguous. */
export type BarrierLabel = 1 | -1 | 0;

/** Result of labeling a single event. */
export interface LabeledEvent {
  readonly entryTimestamp: number;
  readonly exitTimestamp: number;
  readonly label: BarrierLabel;
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly pnl: number;
  readonly duration: number;
}

// ── Core Labeling Function ────────────────────────────────────────────────────

/**
 * Label a candle event using the triple-barrier method.
 *
 * Causal (no look-ahead): scans forward from `entryIdx + 1`.
 * - TP hit: (high - entryPrice) / entryPrice >= takeProfitPct
 * - SL hit: (entryPrice - low) / entryPrice >= stopLossPct
 * - Timeout: timestamp - entryTimestamp > maxHoldingMs
 * - Simultaneous TP/SL in same candle → label = 0 (conservative)
 * - Insufficient remaining candles → null
 */
export function labelEvent(
  candles: readonly Candle[],
  entryIdx: number,
  config: BarrierConfig,
): LabeledEvent | null {
  if (entryIdx < 0 || entryIdx >= candles.length) return null;

  const entryCandle = candles[entryIdx];
  const entryPrice = entryCandle.close;
  const entryTs = entryCandle.timestamp;

  if (entryPrice <= 0) return null;

  const tpThreshold = config.takeProfitPct;
  const slThreshold = config.stopLossPct;
  const maxDuration = config.maxHoldingMs;

  let lastCandle = entryCandle;

  // Scan forward from the next candle (causal, no look-ahead)
  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const elapsed = c.timestamp - entryTs;

    // Check timeout first — if time is up, label as timeout
    if (elapsed > maxDuration) {
      return {
        entryTimestamp: entryTs,
        exitTimestamp: lastCandle.timestamp,
        label: 0,
        entryPrice,
        exitPrice: lastCandle.close,
        pnl: 0,
        duration: lastCandle.timestamp - entryTs,
      };
    }

    // Check TP and SL hits within this candle
    const tpHit = (c.high - entryPrice) / entryPrice >= tpThreshold;
    const slHit = (entryPrice - c.low) / entryPrice >= slThreshold;

    if (tpHit && slHit) {
      // Simultaneous TP/SL → conservative timeout (label = 0)
      return {
        entryTimestamp: entryTs,
        exitTimestamp: c.timestamp,
        label: 0,
        entryPrice,
        exitPrice: entryCandle.close,
        pnl: 0,
        duration: c.timestamp - entryTs,
      };
    }

    if (tpHit) {
      const exitPrice = entryPrice * (1 + tpThreshold);
      return {
        entryTimestamp: entryTs,
        exitTimestamp: c.timestamp,
        label: 1,
        entryPrice,
        exitPrice,
        pnl: exitPrice - entryPrice,
        duration: c.timestamp - entryTs,
      };
    }

    if (slHit) {
      const exitPrice = entryPrice * (1 - slThreshold);
      return {
        entryTimestamp: entryTs,
        exitTimestamp: c.timestamp,
        label: -1,
        entryPrice,
        exitPrice,
        pnl: exitPrice - entryPrice,
        duration: c.timestamp - entryTs,
      };
    }

    lastCandle = c;
  }

  // Insufficient candles to resolve any barrier
  return null;
}
