import type {
  HawkesToxicityConfig,
  HawkesEvent,
  HawkesToxicityResult,
} from './hawkes-jump-types';

export class HawkesJumpToxicityEngine {
  private readonly config: HawkesToxicityConfig;

  constructor(config: Partial<HawkesToxicityConfig> = {}) {
    this.config = {
      baselineIntensity: Math.max(1e-4, config.baselineIntensity ?? 1.2),
      excitationAlpha: Math.max(1e-4, config.excitationAlpha ?? 0.6),
      decayBeta: Math.max(1e-4, config.decayBeta ?? 0.8),
      cascadeThreshold: Math.max(0.1, Math.min(0.99, config.cascadeThreshold ?? 0.85)),
    };
  }

  evaluateIntensity(
    currentTimeMs: number,
    history: readonly HawkesEvent[]
  ): HawkesToxicityResult {
    let selfExcitation = 0;

    for (const event of history) {
      const deltaSec = (currentTimeMs - event.timestampMs) / 1000;
      if (deltaSec >= 0) {
        // Excite with volume-weighted exponential decay
        const volWeight = Math.min(3.0, Math.max(0.5, Math.log10(Math.max(10, event.volume))));
        selfExcitation += this.config.excitationAlpha * volWeight * Math.exp(-this.config.decayBeta * deltaSec);
      }
    }

    const currentIntensity = this.config.baselineIntensity + selfExcitation;
    const branchingRatio = Math.min(0.999, this.config.excitationAlpha / this.config.decayBeta);
    const clusteringFactor = selfExcitation / (this.config.baselineIntensity + 1e-6);
    const isCascadingToxicity =
      (branchingRatio >= this.config.cascadeThreshold && clusteringFactor > 1.0) ||
      clusteringFactor > 2.5;

    return {
      currentIntensity: Number(currentIntensity.toFixed(4)),
      branchingRatio: Number(branchingRatio.toFixed(4)),
      isCascadingToxicity,
      clusteringFactor: Number(clusteringFactor.toFixed(4)),
    };
  }
}
