import type {
  AmihudIlliqConfig,
  AmihudIlliqResult,
  AmihudPriceVolumeBar,
} from './amihud-illiq-types';

export class AmihudIlliqEngine {
  private readonly config: AmihudIlliqConfig;

  constructor(config: Partial<AmihudIlliqConfig> = {}) {
    this.config = {
      minObservations: Math.max(3, config.minObservations ?? 5),
      volumeFloor: Math.max(1e-6, config.volumeFloor ?? 1e-3),
      illiquidityThreshold: Math.max(1e-6, config.illiquidityThreshold ?? 1.0),
      scaleFactor: Math.max(1, config.scaleFactor ?? 1e6),
    };
  }

  estimateIlliquidity(bars: readonly AmihudPriceVolumeBar[]): AmihudIlliqResult {
    const n = bars.length;
    if (n < this.config.minObservations) {
      return {
        meanIlliquidity: 0,
        medianIlliquidity: 0,
        isIlliquidRegime: false,
        sampleCount: n,
      };
    }

    const ratios: number[] = [];
    let sumRatio = 0;

    for (const bar of bars) {
      const vol = Math.max(this.config.volumeFloor, bar.volumeUsd);
      const ratio = (Math.abs(bar.returnPct) / vol) * this.config.scaleFactor;
      ratios.push(ratio);
      sumRatio += ratio;
    }

    ratios.sort((a, b) => a - b);
    const mid = Math.floor(n / 2);
    const medianIlliquidity =
      n % 2 === 0 ? (ratios[mid - 1] + ratios[mid]) / 2 : ratios[mid];
    const meanIlliquidity = sumRatio / n;

    const isIlliquidRegime = meanIlliquidity >= this.config.illiquidityThreshold;

    return {
      meanIlliquidity: Number(meanIlliquidity.toFixed(6)),
      medianIlliquidity: Number(medianIlliquidity.toFixed(6)),
      isIlliquidRegime,
      sampleCount: n,
    };
  }
}
