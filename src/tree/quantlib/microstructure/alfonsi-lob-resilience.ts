import type {
  AlfonsiResilienceConfig,
  AlfonsiResilienceResult,
} from './gatheral-transient-impact-types';

export class AlfonsiLOBResilienceEngine {
  private readonly config: AlfonsiResilienceConfig;

  constructor(config: Partial<AlfonsiResilienceConfig> = {}) {
    this.config = {
      kappa: Math.max(1e-4, config.kappa ?? 0.8),
      asymptoticDepth: Math.max(1.0, config.asymptoticDepth ?? 100.0),
      recoveryTolerance: Math.max(0.001, Math.min(0.2, config.recoveryTolerance ?? 0.05)),
    };
  }

  evaluateResilience(currentDepth: number): AlfonsiResilienceResult {
    const validDepth = Math.max(0, Number.isFinite(currentDepth) ? currentDepth : 0);
    const depthRatio = validDepth / this.config.asymptoticDepth;
    const deficit = Math.max(0, this.config.asymptoticDepth - validDepth);

    let recoveryTimeMs = 0;
    if (deficit > this.config.recoveryTolerance * this.config.asymptoticDepth) {
      const remainingFraction = Math.max(this.config.recoveryTolerance, 1 - depthRatio);
      recoveryTimeMs = (-Math.log(this.config.recoveryTolerance / remainingFraction) / this.config.kappa) * 1000;
    }

    const isBookResilient = depthRatio >= 1 - this.config.recoveryTolerance;

    return {
      currentDepthRatio: Number(depthRatio.toFixed(4)),
      estimatedRecoveryTimeMs: Number(Math.max(0, recoveryTimeMs).toFixed(2)),
      isBookResilient,
      depthDeficit: Number(deficit.toFixed(4)),
    };
  }
}
