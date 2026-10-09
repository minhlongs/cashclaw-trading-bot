export interface PropagatorOrderTick {
  readonly orderSign: 1 | -1;
  readonly volume?: number;
}

export interface BouchaudPropagatorParams {
  readonly gamma0: number;
  readonly tau0: number;
  readonly beta: number;
}

export interface BouchaudPropagatorResult {
  readonly impactSeries: readonly number[];
  readonly peakImpact: number;
  readonly permanentImpact: number;
  readonly relaxationRatio: number;
}
