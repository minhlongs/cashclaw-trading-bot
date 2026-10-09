import type { CrossSectionalSimResult } from '@/tree/alpha/cross-sectional/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { CrossSectionalReport } from './types';
import { breakdownByRegime } from './regime-breakdown';
import { type BuildReportConfig, createEmptyRegimeBreakdown } from './report.config';

export function computeReportRegimeBreakdown(
  simResult: CrossSectionalSimResult, config: BuildReportConfig,
): Record<RegimeLabel, Partial<CrossSectionalReport>> {
  const { periods } = simResult;
  if (!config.regimeLabels || config.regimeLabels.length === 0) {
    return createEmptyRegimeBreakdown();
  }
  const breakdown = breakdownByRegime(periods, config.regimeLabels, config.periodsPerYear);
  return {
    TREND_UP: breakdown.TREND_UP,
    TREND_DOWN: breakdown.TREND_DOWN,
    RANGE: breakdown.RANGE,
    HIGH_VOLATILITY: breakdown.HIGH_VOLATILITY,
    LOW_VOLATILITY: breakdown.LOW_VOLATILITY,
    SHOCK: breakdown.SHOCK,
    UNKNOWN: breakdown.UNKNOWN,
  };
}
