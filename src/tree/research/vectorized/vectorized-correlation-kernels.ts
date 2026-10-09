export function computePearsonCorrelation(x: Float64Array, y: Float64Array): number {
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

export function computeSpearmanCorrelation(x: Float64Array, y: Float64Array): number {
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

  return computePearsonCorrelation(rankX, rankY);
}
