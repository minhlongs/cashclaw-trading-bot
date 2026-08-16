// Alpha Execution Engine — Paper Trading
// Evaluates AlphaSignals against market regime and config, opens/closes paper positions.

import type { AlphaSignal, AlphaDirection } from '@/tree/alpha/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type {
  AlphaExecutionConfig,
  AlphaPosition,
  AlphaPortfolio,
  AlphaExecutionTelemetry,
  AlphaPositionDirection,
  AlphaRejectionReason,
} from './types';

let _counter = 0;

function uid(): string {
  return `ap_${Date.now()}_${++_counter}`;
}

function toDirection(dir: AlphaDirection): AlphaPositionDirection {
  return dir === 'buy' ? 'long' : 'short';
}

function now(): string {
  return new Date().toISOString();
}

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
    return this._positions
      .filter((p) => p.closedAt)
      .reduce((sum, p) => sum + p.pnl, 0);
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

      if (signal.confidence < config.minConfidence) {
        this._telemetry.push({ event: 'signal_rejected', timestamp: Date.now(), payload: { reason: 'confidence_below_threshold' as AlphaRejectionReason, signalName: signal.name } });
        continue;
      }

      if (config.regimeFilter.length > 0 && !config.regimeFilter.includes(regime)) {
        this._telemetry.push({ event: 'signal_rejected', timestamp: Date.now(), payload: { reason: 'regime_filtered' as AlphaRejectionReason, signalName: signal.name } });
        continue;
      }

      const currentOpen = this.openPositions;

      if (currentOpen.length >= config.maxPositions) {
        this._telemetry.push({ event: 'signal_rejected', timestamp: Date.now(), payload: { reason: 'max_positions_reached' as AlphaRejectionReason, openCount: currentOpen.length } });
        continue;
      }

      if (currentOpen.some((p) => p.symbol === signal.features.symbol)) {
        this._telemetry.push({ event: 'signal_rejected', timestamp: Date.now(), payload: { reason: 'duplicate_signal' as AlphaRejectionReason, symbol: signal.features.symbol } });
        continue;
      }

      if (this._totalExposure(currentOpen) >= config.maxExposurePct) {
        this._telemetry.push({ event: 'signal_rejected', timestamp: Date.now(), payload: { reason: 'max_exposure_reached' as AlphaRejectionReason } });
        continue;
      }

      const position: AlphaPosition = {
        id: uid(),
        symbol: signal.features.symbol,
        direction: toDirection(signal.direction),
        entryPrice: 0,
        quantity: 0,
        alphaName: signal.name,
        confidence: signal.confidence,
        pnl: 0,
        openedAt: now(),
      };

      this._positions.push(position);
      opened.push(position);
      this._telemetry.push({ event: 'position_opened', timestamp: Date.now(), payload: { positionId: position.id, symbol: position.symbol, direction: position.direction, alphaName: position.alphaName, regime } });
    }

    this._closeTimedOutPositions(config.positionTimeoutMs);
    return opened;
  }

  /** Update a position with the fill price and quantity after the paper exchange matches. */
  updatePositionFill(positionId: string, price: number, quantity: number): void {
    const pos = this._positions.find((p) => p.id === positionId);
    if (!pos) return;
    (pos as AlphaPosition & { entryPrice?: number; quantity?: number }).entryPrice = price;
    (pos as AlphaPosition & { entryPrice?: number; quantity?: number }).quantity = quantity;
  }

  /** Close an open position. */
  closePosition(positionId: string, exitPrice: number, reason: AlphaPosition['closeReason']): void {
    const pos = this._positions.find((p) => p.id === positionId && !p.closedAt);
    if (!pos) return;

    const mult = pos.direction === 'long' ? 1 : -1;
    pos.pnl = (exitPrice - pos.entryPrice) * mult * pos.quantity;
    pos.closedAt = now();
    pos.closeReason = reason;
    this._telemetry.push({ event: 'position_closed', timestamp: Date.now(), payload: { positionId: pos.id, pnl: pos.pnl, reason } });
  }

  buildPortfolio(regime: RegimeLabel): AlphaPortfolio {
    const open = this.openPositions;
    return {
      positions: [...this._positions],
      totalExposure: this._totalExposure(open),
      regime,
      openCount: open.length,
      totalRealisedPnl: this.totalRealisedPnl,
    };
  }

  private _closeTimedOutPositions(timeoutMs: number): void {
    const cutoff = Date.now() - timeoutMs;
    for (const pos of this.openPositions) {
      if (new Date(pos.openedAt).getTime() < cutoff) {
        this.closePosition(pos.id, pos.entryPrice, 'timeout');
      }
    }
  }

  private _totalExposure(openPositions: AlphaPosition[]): number {
    return openPositions.reduce((sum, p) => sum + Math.abs(p.entryPrice * p.quantity), 0);
  }

  /** Drain the telemetry buffer; called by the parent tick loop. */
  drainTelemetry(): AlphaExecutionTelemetry[] {
    const batch = this._telemetry.slice();
    this._telemetry = [];
    return batch;
  }
}