export interface TransientImpactConfig {
  readonly eta: number; // instantaneous impact coefficient (> 0)
  readonly alpha: number; // volume exponent (typically 0.5 for square-root law)
  readonly decayRate: number; // gamma parameter for exponential decay (> 0)
  readonly permanentFraction: number; // fraction of impact that is permanent (0 <= p <= 1)
}

export interface ImpactSliceExecution {
  readonly tradeVolume: number;
  readonly executionTimeOffsetMs: number;
}

export interface TransientImpactResult {
  readonly totalTemporaryImpact: number;
  readonly totalPermanentImpact: number;
  readonly cumulativeImpactBps: number;
  readonly expectedEffectivePrice: number;
}

export interface AlfonsiResilienceConfig {
  readonly kappa: number; // resilience rate (> 0)
  readonly asymptoticDepth: number; // equilibrium depth D_inf (> 0)
  readonly recoveryTolerance: number; // epsilon for recovery threshold (e.g., 0.05)
}

export interface AlfonsiResilienceResult {
  readonly currentDepthRatio: number;
  readonly estimatedRecoveryTimeMs: number;
  readonly isBookResilient: boolean;
  readonly depthDeficit: number;
}
