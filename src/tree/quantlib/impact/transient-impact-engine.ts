import type {
  TransientImpactConfig,
  ImpactExecutionSlice,
  TransientImpactResult,
} from './transient-impact-types';

export class TransientImpactEngine {
  private readonly gamma: number;
  private readonly alpha: number;
  private readonly epsilon: number;

  constructor(config: TransientImpactConfig = {}) {
    this.gamma = config.gamma ?? 0.005;
    this.alpha = config.alpha ?? 0.5;
    this.epsilon = config.epsilon ?? 1.0;
  }

  evaluateImpactTrajectory(
    slices: readonly ImpactExecutionSlice[],
    midPrice: number
  ): TransientImpactResult {
    if (slices.length === 0 || midPrice <= 0) {
      return {
        instantaneousImpactBps: 0,
        accumulatedPriceImpactBps: 0,
        totalExecutionSlippageCost: 0,
        trajectoryProfile: [],
      };
    }

    const trajectoryProfile: Array<{ time: number; impactBps: number }> = [];
    let totalSlippageCost = 0;
    let accumulatedBps = 0;

    slices.forEach((slice, idx) => {
      let impactSum = 0;
      for (let prevIdx = 0; prevIdx <= idx; prevIdx++) {
        const prev = slices[prevIdx]!;
        const dt = Math.max(0, slice.time - prev.time);
        const kernel = this.gamma / Math.pow(dt + this.epsilon, this.alpha);
        impactSum += prev.quantity * kernel;
      }

      const impactBps = impactSum * 10000;
      trajectoryProfile.push({
        time: slice.time,
        impactBps: Number(impactBps.toFixed(4)),
      });

      const slippagePerUnit = midPrice * (impactBps / 10000);
      totalSlippageCost += slice.quantity * slippagePerUnit;
      accumulatedBps = impactBps;
    });

    const firstImpact = trajectoryProfile[0]?.impactBps ?? 0;

    return {
      instantaneousImpactBps: firstImpact,
      accumulatedPriceImpactBps: Number(accumulatedBps.toFixed(4)),
      totalExecutionSlippageCost: Number(totalSlippageCost.toFixed(4)),
      trajectoryProfile,
    };
  }
}
