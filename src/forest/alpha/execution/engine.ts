// Alpha Execution Engine — Paper Trading facade.
// Evaluates AlphaSignals against market regime and config, opens/closes paper positions.

import type { AlphaSignal } from '@/tree/alpha/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type {
  AlphaExecutionConfig,
  AlphaPosition,
  AlphaExecutionTelemetry,
} from './types';
import {
  makePosition,
  applyFill,
  computePnl,
  isoNow,
  isTimedOut,
  buildAlphaPortfolio,
  totalRealisedPnl,
  getSignalRejection,
} from './engine-positions';
import {
  telemetrySignalRejected,
  telemetryPositionOpened,
  telemetryPositionClosed,
} from './engine-telemetry';

export class AlphaExecutionEngine {
  private _positions: AlphaPosition[] = [];
  private _telemetry: AlphaExecutionTelemetry[] = [];

  get openPositions(): AlphaPosition[] {
    return this._positions.filter((p) => !p.closedAt);
  }

  get allPositions(): AlphaPosition[] {
    return [...this._positions];
  }

  get totalRealisedPnl(): number {
    return totalRealisedPnl(this._positions);
  }

  /** Evaluate a batch of alpha signals, then execute the eligible ones as paper trades. */
  evaluateAndExecute(
    signals: AlphaSignal[],
    regime: RegimeLabel,
    config: AlphaExecutionConfig,
  ): AlphaPosition[] {
    if (!config.enabled) return [];
    const opened: AlphaPosition[] = [];

    for (const signal of signals) {
      if (signal.direction === 'hold') continue;
      const rejection = getSignalRejection(signal, regime, config, this.openPositions);
      if (rejection) {
        this._telemetry.push(telemetrySignalRejected(rejection.reason, rejection.extra));
        continue;
      }

      const position = makePosition(signal);
      this._positions.push(position);
      opened.push(position);
      this._telemetry.push(telemetryPositionOpened({
        positionId: position.id,
        symbol: position.symbol,
        direction: position.direction,
        alphaName: position.alphaName,
        regime,
      }));
    }

    this._closeTimedOutPositions(config.positionTimeoutMs);
    return opened;
  }

  /** Update a position with the fill price and quantity after the paper exchange matches. */
  updatePositionFill(positionId: string, price: number, quantity: number): void {
    const pos = this._positions.find((p) => p.id === positionId);
    if (pos) applyFill(pos, price, quantity);
  }

  /** Close an open position. */
  closePosition(positionId: string, exitPrice: number, reason: AlphaPosition['closeReason']): void {
    const pos = this._positions.find((p) => p.id === positionId && !p.closedAt);
    if (!pos || !reason) return;
    pos.pnl = computePnl(pos, exitPrice);
    pos.closedAt = isoNow();
    pos.closeReason = reason;
    this._telemetry.push(telemetryPositionClosed({ positionId: pos.id, pnl: pos.pnl, reason }));
  }

  buildPortfolio(regime: RegimeLabel) {
    return buildAlphaPortfolio(this._positions, regime);
  }

  private _closeTimedOutPositions(timeoutMs: number): void {
    const cutoff = Date.now() - timeoutMs;
    for (const pos of this.openPositions) {
      if (isTimedOut(pos, cutoff)) {
        this.closePosition(pos.id, pos.entryPrice, 'timeout');
      }
    }
  }

  /** Drain the telemetry buffer; called by the parent tick loop. */
  drainTelemetry(): AlphaExecutionTelemetry[] {
    const batch = this._telemetry.slice();
    this._telemetry = [];
    return batch;
  }
}
