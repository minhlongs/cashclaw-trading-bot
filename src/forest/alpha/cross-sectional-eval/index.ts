// Barrel export for the cross-sectional evaluation module (plan §3 Step C/D).

export type {
  CrossSectionalReport,
  CostAttributionBreakdown,
  ExposureSeries,
} from './types';

export {
  annualizedSharpe,
  annualizedSortino,
  maxDrawdownPct,
  compoundReturn,
} from './return-metrics';

export type {
  PreciseAttributionInput,
  LongShortAttributionResult,
  CostAttributionResult,
} from './attribution';

export {
  attributeLongShortPrecise,
  attributeLongShortProportional,
  attributeCosts,
} from './attribution';

export type { RegimeSubReport } from './regime-breakdown';
export { breakdownByRegime } from './regime-breakdown';

export type { BuildReportConfig } from './report';
export { buildCrossSectionalReport } from './report';

export type {
  CrossSectionalEvalConfig,
  CrossSectionalSizingOutcome,
  CrossSectionalResult,
} from './evaluate-config';
export { evaluateCrossSectional } from './evaluate';
