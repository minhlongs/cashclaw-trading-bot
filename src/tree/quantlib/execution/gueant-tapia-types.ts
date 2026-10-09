export interface GueantTapiaAsset {
  readonly symbol: string;
  readonly shares: number;
  readonly price: number;
  readonly volatility: number;
  readonly temporaryImpact: number;
}

export interface GueantTapiaParams {
  readonly assets: readonly GueantTapiaAsset[];
  readonly correlationMatrix?: readonly (readonly number[])[];
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly riskAversion: number;
}

export interface AssetStepExecution {
  readonly symbol: string;
  readonly sharesExecuted: number;
  readonly sharesRemaining: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface GueantTapiaStep {
  readonly step: number;
  readonly time: number;
  readonly assetExecutions: readonly AssetStepExecution[];
}

export interface GueantTapiaResult {
  readonly steps: readonly GueantTapiaStep[];
  readonly totalExecutionCost: number;
  readonly assetVwaps: Readonly<Record<string, number>>;
  readonly terminalShares: Readonly<Record<string, number>>;
}
