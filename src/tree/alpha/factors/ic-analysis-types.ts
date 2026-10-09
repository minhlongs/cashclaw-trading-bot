import type { RegimeIcSummary } from './ic-metrics';
import type { IcPoint, QuantileSpreadPoint } from './ic-helpers';
export type { IcPoint, QuantileSpreadPoint } from './ic-helpers';

export interface IcAnalysisConfig {
  readonly horizonBars: number;
  readonly rebalanceStride?: number;
  readonly quantiles?: number;
  readonly minCrossSectionalSymbols?: number;
  readonly stabilityWindow?: number;
  readonly regimeLabels?: Readonly<Record<number, string>>;
}

export interface IcAnalysisResult {
  readonly icSeries: IcPoint[];
  readonly icMean: number | null;
  readonly icStd: number | null;
  readonly icIr: number | null;
  readonly rankIcMean: number | null;
  readonly stability: number | null;
  readonly validIcCount: number;
  readonly insufficientIcObservations: boolean;
  readonly quantileSpread: QuantileSpreadPoint[];
  readonly quantileTurnover: number[];
  readonly regimeBreakdown: RegimeIcSummary[];
}
