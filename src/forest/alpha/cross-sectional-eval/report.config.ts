// Cross-sectional report configuration types (plan §3 Step C).
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.

import type { RegimeLabel } from '@/tree/regime/types';
import type { CrossSectionalReport } from './types';
import type { PreciseAttributionInput } from './attribution';

export interface BuildReportConfig {
  /** Experiment identifier. */
  readonly experimentId: string;
  /** Universe id (symbol). */
  readonly symbol: string;
  /** Bar timeframe (e.g. '1h'). */
  readonly timeframe: string;
  /** Overall regime label for the experiment window. */
  readonly regime: RegimeLabel;
  /** Periods per year for annualization (e.g. 365*24 for hourly). */
  readonly periodsPerYear: number;
  /** Cost stress mode for cost attribution decomposition. */
  readonly stressMode?: 'normal' | 'conservative' | 'adverse' | 'extreme';
  /** Optional per-asset returns for precise long/short attribution. */
  readonly assetPeriodReturns?: readonly PreciseAttributionInput[];
  /** Optional precomputed regime labels (aligned to periods). */
  readonly regimeLabels?: readonly RegimeLabel[];
}

export function createEmptyRegimeBreakdown(): Record<RegimeLabel, Partial<CrossSectionalReport>> {
  return {
    TREND_UP: {},
    TREND_DOWN: {},
    RANGE: {},
    HIGH_VOLATILITY: {},
    LOW_VOLATILITY: {},
    SHOCK: {},
    UNKNOWN: {},
  };
}
