import type {
  AsynchronousTick,
  HayashiYoshidaConfig,
  HayashiYoshidaLagMetrics,
  HayashiYoshidaResult,
} from './hayashi-yoshida-types';
import {
  computeIntervalReturns,
  computeLagCovariance,
} from './hayashi-yoshida-math';

export class HayashiYoshidaEngine {
  private readonly maxLagMs: number;
  private readonly lagStepMs: number;
  private readonly minObservations: number;

  constructor(config: HayashiYoshidaConfig = {}) {
    this.maxLagMs = Math.max(0, config.maxLagMs ?? 1000);
    this.lagStepMs = Math.max(1, config.lagStepMs ?? 100);
    this.minObservations = Math.max(3, config.minObservations ?? 5);
  }

  computeAsynchronousCrossCorrelation(
    ticksX: readonly AsynchronousTick[],
    ticksY: readonly AsynchronousTick[]
  ): HayashiYoshidaResult {
    if (ticksX.length < this.minObservations || ticksY.length < this.minObservations) {
      return {
        optimalLagMs: 0,
        peakCorrelation: 0,
        instantaneousCorrelation: 0,
        isLeader: false,
        allLagMetrics: [],
      };
    }

    const returnsX = computeIntervalReturns(ticksX);
    const returnsY = computeIntervalReturns(ticksY);
    const rvX = returnsX.reduce((acc, r) => acc + r.ret * r.ret, 0);
    const rvY = returnsY.reduce((acc, r) => acc + r.ret * r.ret, 0);
    const denom = Math.sqrt(Math.max(1e-16, rvX * rvY));

    const metrics: HayashiYoshidaLagMetrics[] = [];
    let peakAbsCorr = -1;
    let optimalLag = 0;
    let peakCorr = 0;

    for (let lag = -this.maxLagMs; lag <= this.maxLagMs; lag += this.lagStepMs) {
      const cov = computeLagCovariance(returnsX, returnsY, lag);
      const corr = Math.max(-1, Math.min(1, cov / denom));
      metrics.push({
        lagMs: lag,
        covariance: Number(cov.toFixed(8)),
        correlation: Number(corr.toFixed(4)),
      });
      if (Math.abs(corr) > peakAbsCorr) {
        peakAbsCorr = Math.abs(corr);
        optimalLag = lag;
        peakCorr = corr;
      }
    }

    const instant = metrics.find((m) => m.lagMs === 0)?.correlation ?? 0;
    return {
      optimalLagMs: optimalLag,
      peakCorrelation: Number(peakCorr.toFixed(4)),
      instantaneousCorrelation: Number(instant.toFixed(4)),
      isLeader: optimalLag > 0,
      allLagMetrics: metrics,
    };
  }
}
