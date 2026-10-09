export interface CarteaJaimungalParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly numSteps: number;
  readonly timeHorizon: number;
  readonly inventoryPenalty: number; // phi
  readonly temporaryImpact: number; // eta
  readonly alphaDrift?: number; // alpha_t drift signal (positive = expected price appreciation)
}

export interface CarteaJaimungalStep {
  readonly step: number;
  readonly time: number;
  readonly sharesExecuted: number;
  readonly sharesRemaining: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface CarteaJaimungalResult {
  readonly trajectory: readonly CarteaJaimungalStep[];
  readonly totalExecutionCost: number;
  readonly vwapPrice: number;
  readonly terminalShares: number;
  readonly effectiveAlphaTilt: number;
}
