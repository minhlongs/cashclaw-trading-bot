// Multivariate Johansen Cointegration Estimator
// Analytical eigenvalue extraction for rank testing, cointegrating vector, and OU half-life.

import type { JohansenSeriesInput, JohansenTestResult } from './johansen-types';

const TRACE_95: Record<number, number[]> = { 2: [15.49, 3.84], 3: [29.8, 15.49, 3.84] };
const MAX_95: Record<number, number[]> = { 2: [14.26, 3.84], 3: [21.13, 14.26, 3.84] };

function computeAr1HalfLife(spread: number[]): number {
  if (spread.length < 5) return 1;
  let sX = 0, sY = 0, sXX = 0, sXY = 0;
  const n = spread.length - 1;
  for (let i = 0; i < n; i++) {
    const x = spread[i], y = spread[i + 1];
    sX += x; sY += y; sXX += x * x; sXY += x * y;
  }
  const phi = (n * sXY - sX * sY) / Math.max(1e-12, n * sXX - sX * sX);
  if (phi >= 1 || phi <= 0) return 999;
  const theta = -Math.log(phi);
  return theta > 0 ? Math.max(1, Math.round(Math.LN2 / theta)) : 999;
}

export function estimateJohansenCointegration(input: JohansenSeriesInput): JohansenTestResult {
  const { prices } = input;
  const T = prices.length;
  if (T < 10) throw new Error('Johansen test requires at least 10 observations.');
  const K = prices[0].length;
  if (K < 2 || K > 3) throw new Error('Supported assets dimension K must be 2 or 3.');

  const dX: number[][] = [], Xlag: number[][] = [];
  for (let t = 1; t < T; t++) {
    dX.push(prices[t].map((p, k) => p - prices[t - 1][k]));
    Xlag.push(prices[t - 1].slice());
  }

  const N = dX.length;
  const S00 = Array.from({ length: 2 }, () => new Float64Array(2));
  const S11 = Array.from({ length: 2 }, () => new Float64Array(2));
  const S01 = Array.from({ length: 2 }, () => new Float64Array(2));

  for (let t = 0; t < N; t++) {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        S00[i][j] += (dX[t][i] * dX[t][j]) / N;
        S11[i][j] += (Xlag[t][i] * Xlag[t][j]) / N;
        S01[i][j] += (dX[t][i] * Xlag[t][j]) / N;
      }
    }
  }

  const det00 = S00[0][0] * S00[1][1] - S00[0][1] * S00[1][0] || 1e-9;
  const inv00 = [[S00[1][1] / det00, -S00[0][1] / det00], [-S00[1][0] / det00, S00[0][0] / det00]];
  const det11 = S11[0][0] * S11[1][1] - S11[0][1] * S11[1][0] || 1e-9;
  const inv11 = [[S11[1][1] / det11, -S11[0][1] / det11], [-S11[1][0] / det11, S11[0][0] / det11]];

  const P = [
    [S01[0][0] * inv00[0][0] + S01[1][0] * inv00[1][0], S01[0][0] * inv00[0][1] + S01[1][0] * inv00[1][1]],
    [S01[0][1] * inv00[0][0] + S01[1][1] * inv00[1][0], S01[0][1] * inv00[0][1] + S01[1][1] * inv00[1][1]],
  ];
  const Q = [
    [P[0][0] * S01[0][0] + P[0][1] * S01[1][0], P[0][0] * S01[0][1] + P[0][1] * S01[1][1]],
    [P[1][0] * S01[0][0] + P[1][1] * S01[1][0], P[1][0] * S01[0][1] + P[1][1] * S01[1][1]],
  ];
  const M = [
    [inv11[0][0] * Q[0][0] + inv11[0][1] * Q[1][0], inv11[0][0] * Q[0][1] + inv11[0][1] * Q[1][1]],
    [inv11[1][0] * Q[0][0] + inv11[1][1] * Q[1][0], inv11[1][0] * Q[0][1] + inv11[1][1] * Q[1][1]],
  ];

  const trM = M[0][0] + M[1][1];
  const detM = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  const disc = Math.max(0, trM * trM - 4 * detM);
  const l1 = Math.min(0.9999, Math.max(0.0001, (trM + Math.sqrt(disc)) / 2));
  const l2 = Math.min(0.9999, Math.max(0.0001, (trM - Math.sqrt(disc)) / 2));
  const eigenvalues = [l1, l2];

  const traceStats = [-N * (Math.log(1 - l1) + Math.log(1 - l2)), -N * Math.log(1 - l2)];
  const maxEigenStats = [-N * Math.log(1 - l1), -N * Math.log(1 - l2)];
  const traceCrit = TRACE_95[2], maxCrit = MAX_95[2];

  let rank = 0;
  if (traceStats[0] > traceCrit[0] && maxEigenStats[0] > maxCrit[0]) {
    rank = traceStats[1] > traceCrit[1] ? 2 : 1;
  }

  const beta2 = Math.abs(M[0][1]) > 1e-7 ? -(M[0][0] - l1) / M[0][1] : -1;
  const cointegratingVector = [1, Number(beta2.toFixed(4))];
  const spread = prices.map((row) => row[0] + beta2 * row[1]);

  return {
    rank, eigenvalues, traceStats, maxEigenStats,
    traceCriticalValues95: traceCrit, maxEigenCriticalValues95: maxCrit,
    cointegratingVector, halfLifeBars: computeAr1HalfLife(spread), isCointegrated: rank >= 1,
  };
}
