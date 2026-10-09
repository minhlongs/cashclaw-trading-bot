import type {
  TransientImpactConfig,
  ImpactSliceExecution,
  TransientImpactResult,
} from './gatheral-transient-impact-types';

export class GatheralTransientImpactEngine {
  private readonly config: TransientImpactConfig;

  constructor(config: Partial<TransientImpactConfig> = {}) {
    this.config = {
      eta: Math.max(1e-6, config.eta ?? 0.05),
      alpha: Math.max(0.1, Math.min(1.0, config.alpha ?? 0.5)),
      decayRate: Math.max(1e-4, config.decayRate ?? 0.002),
      permanentFraction: Math.max(0, Math.min(1.0, config.permanentFraction ?? 0.15)),
    };
  }

  computeImpact(
    basePrice: number,
    slices: readonly ImpactSliceExecution[],
    evaluationTimeOffsetMs: number
  ): TransientImpactResult {
    if (basePrice <= 0 || !Number.isFinite(basePrice)) {
      throw new Error('Base price must be positive and finite.');
    }

    let tempImpact = 0;
    let permImpact = 0;

    for (const slice of slices) {
      if (slice.tradeVolume <= 0 || !Number.isFinite(slice.tradeVolume)) continue;
      const timeDeltaMs = Math.max(0, evaluationTimeOffsetMs - slice.executionTimeOffsetMs);
      const instantaneous = this.config.eta * Math.pow(slice.tradeVolume, this.config.alpha);
      const decay = Math.exp(-this.config.decayRate * (timeDeltaMs / 1000));

      tempImpact += instantaneous * decay;
      permImpact += instantaneous * this.config.permanentFraction;
    }

    const netImpactPriceDelta = tempImpact + permImpact;
    const effectivePrice = basePrice + netImpactPriceDelta;
    const impactBps = (netImpactPriceDelta / basePrice) * 10000;

    return {
      totalTemporaryImpact: Number(tempImpact.toFixed(6)),
      totalPermanentImpact: Number(permImpact.toFixed(6)),
      cumulativeImpactBps: Number(impactBps.toFixed(4)),
      expectedEffectivePrice: Number(effectivePrice.toFixed(4)),
    };
  }
}
