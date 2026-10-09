import type { AlphaSignal } from '@/tree/alpha/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { AlphaPosition, AlphaRejectionReason, AlphaExecutionConfig } from './types';
import { totalExposure } from './engine-positions-exposure';

export interface SignalRejection {
  readonly reason: AlphaRejectionReason;
  readonly extra: Record<string, unknown>;
}

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
