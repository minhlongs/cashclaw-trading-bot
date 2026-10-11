export interface HubermanStanzlManipulationStep {
  readonly step: number;
  readonly shares: number;
  readonly price: number;
  readonly cumulativeShares: number;
  readonly stepCost: number;
}

export interface HubermanStanzlManipulationParams {
  readonly tradeTrajectory: readonly number[];
  readonly initialPrice: number;
  readonly permanentImpactFactor: number;
  readonly transientImpactFactor?: number;
  readonly decayRate?: number;
}

export interface HubermanStanzlManipulationResult {
  readonly schedule: readonly HubermanStanzlManipulationStep[];
  readonly totalCost: number;
  readonly effectivePrice: number;
  readonly roundTripCost: number;
  readonly isQuasiArbitrageFree: boolean;
  readonly permanentImpactCost: number;
  readonly transientImpactCost: number;
}
