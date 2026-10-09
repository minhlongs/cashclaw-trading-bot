import type {
  VectorizedSeries,
  VectorizedIcMetrics,
  VectorizedQuantileSpread,
} from './vectorized-factor-types';

export class VectorizedFactorEngine {
  computePearsonCorrelation(x: Float64Array, y: Float64Array): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    let sumX = 0;
    let sumY = 0;
    let validCount = 0;

    for (let i = 0; i < n; i++) {
      const xi = x[i];
      const yi = y[i];
      if (Number.isFinite(xi) && Number.isFinite(yi)) {
        sumX += xi;
        sumY += yi;
        validCount++;
      }
    }

    if (validCount < 2) return 0;
    const meanX = sumX / validCount;
    const meanY = sumY / validCount;

    let cov = 0;
    let varX = 0;
    let varY = 0;

    for (let i = 0; i < n; i++) {
      const xi = x[i];
      const yi = y[i];
      if (Number.isFinite(xi) && Number.isFinite(yi)) {
        const dx = xi - meanX;
        const dy = yi - meanY;
        cov += dx * dy;
        varX += dx * dx;
        varY += dy * dy;
      }
    }

    const denom = Math.sqrt(varX * varY);
    return denom > 1e-12 ? Math.max(-1, Math.min(1, cov / denom)) : 0;
  }

  computeSpearmanCorrelation(x: Float64Array, y: Float64Array): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const validIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
        validIndices.push(i);
      }
    }

    const m = validIndices.length;
    if (m < 2) return 0;

    const rankX = new Float64Array(m);
    const rankY = new Float64Array(m);

    const sortedByX = [...validIndices].sort((a, b) => (x[a] ?? 0) - (x[b] ?? 0));
    const sortedByY = [...validIndices].sort((a, b) => (y[a] ?? 0) - (y[b] ?? 0));

    sortedByX.forEach((origIdx, rank) => {
      const pos = validIndices.indexOf(origIdx);
      if (pos >= 0) rankX[pos] = rank + 1;
    });

    sortedByY.forEach((origIdx, rank) => {
      const pos = validIndices.indexOf(origIdx);
      if (pos >= 0) rankY[pos] = rank + 1;
    });

    return this.computePearsonCorrelation(rankX, rankY);
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
