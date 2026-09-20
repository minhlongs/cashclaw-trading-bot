// Alpha Execution Engine — position lifecycle helpers.
// Opening, filling, closing, and position-level bookkeeping.

import type { AlphaSignal, AlphaDirection } from '@/tree/alpha/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type {
  AlphaPosition,
  AlphaPortfolio,
  AlphaPositionDirection,
  AlphaRejectionReason,
  AlphaExecutionConfig,
} from './types';

let _counter = 0;

export function nextPositionId(): string {
  return `ap_${Date.now()}_${++_counter}`;
}

export function toPositionDirection(dir: AlphaDirection): AlphaPositionDirection {
  return dir === 'buy' ? 'long' : 'short';
}

export function isoNow(): string {
  return new Date().toISOString();
}

/** Build an `AlphaPosition` from an alpha signal (before fill). */
export function makePosition(signal: AlphaSignal): AlphaPosition {
  return {
    id: nextPositionId(),
    symbol: signal.features.symbol,
    direction: toPositionDirection(signal.direction),
    entryPrice: 0,
    quantity: 0,
    alphaName: signal.name,
    confidence: signal.confidence,
    pnl: 0,
    openedAt: isoNow(),
  };
}

/** Set entry price + quantity once the paper exchange reports a fill. */
export function applyFill(pos: AlphaPosition, price: number, quantity: number): void {
  (pos as AlphaPosition & { entryPrice?: number; quantity?: number }).entryPrice = price;
  (pos as AlphaPosition & { entryPrice?: number; quantity?: number }).quantity = quantity;
}

/** Realised P&L for a closed position (long: exit - entry, short: entry - exit). */
export function computePnl(pos: AlphaPosition, exitPrice: number): number {
  const mult = pos.direction === 'long' ? 1 : -1;
  return (exitPrice - pos.entryPrice) * mult * pos.quantity;
}

/** Absolute notional exposure of a position (`|entryPrice * quantity|`). */
export function positionExposure(pos: AlphaPosition): number {
  return Math.abs(pos.entryPrice * pos.quantity);
}

/** Total notional exposure across a set of open positions. */
export function totalExposure(positions: readonly AlphaPosition[]): number {
  return positions.reduce((sum, p) => sum + positionExposure(p), 0);
}

/** True when a position was opened before `cutoffMs` (epoch ms). */
export function isTimedOut(pos: AlphaPosition, cutoffMs: number): boolean {
  return new Date(pos.openedAt).getTime() < cutoffMs;
}

/** Calculate aggregated realised PnL across all closed positions. */
export function totalRealisedPnl(positions: readonly AlphaPosition[]): number {
  return positions
    .filter((p) => p.closedAt)
    .reduce((sum, p) => sum + p.pnl, 0);
}

/** Build a snapshot portfolio object for a set of positions and a regime. */
export function buildAlphaPortfolio(
  positions: readonly AlphaPosition[],
  regime: RegimeLabel,
): AlphaPortfolio {
  const open = positions.filter((p) => !p.closedAt);
  return {
    positions: [...positions],
    totalExposure: totalExposure(open),
    regime,
    openCount: open.length,
    totalRealisedPnl: totalRealisedPnl(positions),
  };
}

export interface SignalRejection {
  readonly reason: AlphaRejectionReason;
  readonly extra: Record<string, unknown>;
}

/** Check if an incoming signal should be rejected before opening a position. */
export function getSignalRejection(
  signal: AlphaSignal,
  regime: RegimeLabel,
  config: AlphaExecutionConfig,
  openPositions: readonly AlphaPosition[],
): SignalRejection | null {
  if (signal.confidence < config.minConfidence) {
    return { reason: 'confidence_below_threshold', extra: { signalName: signal.name } };
  }
  if (config.regimeFilter.length > 0 && !config.regimeFilter.includes(regime)) {
    return { reason: 'regime_filtered', extra: { signalName: signal.name } };
  }
  if (openPositions.length >= config.maxPositions) {
    return { reason: 'max_positions_reached', extra: { openCount: openPositions.length } };
  }
  if (openPositions.some((p) => p.symbol === signal.features.symbol)) {
    return { reason: 'duplicate_signal', extra: { symbol: signal.features.symbol } };
  }
  if (totalExposure(openPositions) >= config.maxExposurePct) {
    return { reason: 'max_exposure_reached', extra: {} };
  }
  return null;
}
