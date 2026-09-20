// Alpha Execution Engine — telemetry helpers.
// Emits structured events for signal rejection, position open/close.

import type { RegimeLabel } from '@/tree/regime/types';
import type { AlphaExecutionTelemetry, AlphaRejectionReason } from './types';

function rejected(reason: AlphaRejectionReason, extra: Record<string, unknown> = {}): AlphaExecutionTelemetry {
  return { event: 'signal_rejected', timestamp: Date.now(), payload: { reason, ...extra } };
}

export function telemetrySignalRejected(
  reason: AlphaRejectionReason,
  extra: Record<string, unknown> = {},
): AlphaExecutionTelemetry {
  return rejected(reason, extra);
}

export function telemetryConfidenceBelowThreshold(signalName: string): AlphaExecutionTelemetry {
  return rejected('confidence_below_threshold', { signalName });
}

export function telemetryRegimeFiltered(signalName: string): AlphaExecutionTelemetry {
  return rejected('regime_filtered', { signalName });
}

export function telemetryMaxPositionsReached(openCount: number): AlphaExecutionTelemetry {
  return rejected('max_positions_reached', { openCount });
}

export function telemetrySignalRejectedWith(
  reason: AlphaRejectionReason,
  extra: Record<string, unknown>,
): AlphaExecutionTelemetry {
  return rejected(reason, extra);
}

export function telemetryPositionOpened(params: {
  readonly positionId: string;
  readonly symbol: string;
  readonly direction: 'long' | 'short';
  readonly alphaName: string;
  readonly regime: RegimeLabel;
}): AlphaExecutionTelemetry {
  return {
    event: 'position_opened',
    timestamp: Date.now(),
    payload: {
      positionId: params.positionId,
      symbol: params.symbol,
      direction: params.direction,
      alphaName: params.alphaName,
      regime: params.regime,
    },
  };
}

export function telemetryPositionClosed(params: {
  readonly positionId: string;
  readonly pnl: number;
  readonly reason: 'exit_signal' | 'timeout' | 'regime_shift' | 'manual';
}): AlphaExecutionTelemetry {
  return {
    event: 'position_closed',
    timestamp: Date.now(),
    payload: { positionId: params.positionId, pnl: params.pnl, reason: params.reason },
  };
}
