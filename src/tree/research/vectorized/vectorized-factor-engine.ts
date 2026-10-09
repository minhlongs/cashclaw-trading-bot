import type {
  VectorizedSeries,
  VectorizedIcMetrics,
  VectorizedQuantileSpread,
} from './vectorized-factor-types';
import {
  computePearsonCorrelation,
  computeSpearmanCorrelation,
} from './vectorized-correlation-kernels';

export class VectorizedFactorEngine {
  computePearsonCorrelation(x: Float64Array, y: Float64Array): number {
    return computePearsonCorrelation(x, y);
  }

  computeSpearmanCorrelation(x: Float64Array, y: Float64Array): number {
    return computeSpearmanCorrelation(x, y);
  }

  computeFactorIc(factor: VectorizedSeries, forwardReturns: Float64Array): VectorizedIcMetrics {
    const pearson = this.computePearsonCorrelation(factor.data, forwardReturns);
    const spearman = this.computeSpearmanCorrelation(factor.data, forwardReturns);
    const n = Math.min(factor.data.length, forwardReturns.length);

    let tStat = 0;
    if (n > 2 && Math.abs(spearman) < 1) {
      tStat = (spearman * Math.sqrt(n - 2)) / Math.sqrt(1 - spearman * spearman);
    }

    const pApprox = Math.exp(-0.717 * Math.abs(tStat) - 0.416 * tStat * tStat);

    return {
      factorName: factor.name,
      pearsonIc: Number(pearson.toFixed(4)),
      spearmanIc: Number(spearman.toFixed(4)),
      tStatistic: Number(tStat.toFixed(4)),
      pValueApprox: Number(Math.min(1, Math.max(0, pApprox)).toFixed(4)),
      observations: n,
    };
  }

  computeQuantileSpread(factorData: Float64Array, returns: Float64Array, quantiles = 5): VectorizedQuantileSpread {
    const n = Math.min(factorData.length, returns.length);
    if (n < quantiles) {
      return { topQuantileMeanReturn: 0, bottomQuantileMeanReturn: 0, longShortSpread: 0, monotonicScore: 0 };
    }

    const pairs: Array<{ f: number; r: number }> = [];
    for (let i = 0; i < n; i++) {
      const f = factorData[i];
      const r = returns[i];
      if (Number.isFinite(f) && Number.isFinite(r)) {
        pairs.push({ f: f ?? 0, r: r ?? 0 });
      }
    }

    pairs.sort((a, b) => a.f - b.f);
    const bucketSize = Math.floor(pairs.length / quantiles);
    if (bucketSize === 0) {
      return { topQuantileMeanReturn: 0, bottomQuantileMeanReturn: 0, longShortSpread: 0, monotonicScore: 0 };
    }

    const bottomBucket = pairs.slice(0, bucketSize);
    const topBucket = pairs.slice(pairs.length - bucketSize);

    const bottomMean = bottomBucket.reduce((s, p) => s + p.r, 0) / bottomBucket.length;
    const topMean = topBucket.reduce((s, p) => s + p.r, 0) / topBucket.length;
    const spread = topMean - bottomMean;

    return {
      topQuantileMeanReturn: Number(topMean.toFixed(6)),
      bottomQuantileMeanReturn: Number(bottomMean.toFixed(6)),
      longShortSpread: Number(spread.toFixed(6)),
      monotonicScore: spread > 0 ? 1 : spread < 0 ? -1 : 0,
    };
  }
}
