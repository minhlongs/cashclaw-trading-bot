// Pure OLS factor exposure — no side effects, no external deps.
// Implements single and multi-factor regression via matrix operations.

import type {
  Factor,
  FactorAnalysisResult,
  FactorExposure,
} from './types';

// ── Matrix Helpers ─────────────────────────────────────────────────────────

/** Transpose a matrix (rows become columns). */
function transpose(m: number[][]): number[][] {
  if (m.length === 0) return [];
  const cols = m[0]!.length;
  const result: number[][] = [];
  for (let c = 0; c < cols; c++) {
    const row: number[] = [];
    for (let r = 0; r < m.length; r++) {
      row.push(m[r]![c]!);
    }
    result.push(row);
  }
  return result;
}

/** Multiply two matrices: A (n×k) × B (k×m) = (n×m). */
function matMul(a: number[][], b: number[][]): number[][] {
  const n = a.length;
  const k = a[0]!.length;
  const m = b[0]!.length;
  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let p = 0; p < k; p++) {
        sum += a[i]![p]! * b[p]![j]!;
      }
      row.push(sum);
    }
    result.push(row);
  }
  return result;
}

/** Multiply matrix by a column vector: A (n×k) × v (k) = (n). */
function matVecMul(a: number[][], v: number[]): number[] {
  return a.map((row) => row.reduce((s, val, i) => s + val * v[i]!, 0));
}

/** Invert a small matrix via Gauss-Jordan elimination. Returns null when singular. */
function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length;
  const aug = m.map((row, i) => {
    const r = row.slice();
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    return r;
  });
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row]![col]!) > Math.abs(aug[maxRow]![col]!)) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col]![col]!;
    if (Math.abs(pivot) < 1e-12) return null;
    for (let j = 0; j < 2 * n; j++) aug[col]![j]! /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row]![col]!;
      for (let j = 0; j < 2 * n; j++) {
        aug[row]![j]! -= factor * aug[col]![j]!;
      }
    }
  }
  return aug.map((row) => row.slice(n));
}

// ── OLS Core ───────────────────────────────────────────────────────────────

/** Run OLS: y = alpha + X * beta + epsilon. Returns [alpha, ...betas] and residual variance. */
function ols(
  y: number[],
  X: number[][],
): { coefficients: number[]; residualVariance: number; nObs: number } {
  const n = y.length;
  const k = X[0]!.length;
  const ones = Array.from({ length: n }, () => [1]);
  const design = X.map((row, i) => [...ones[i]!, ...row]);
  const Xt = transpose(design);
  const XtX = matMul(Xt, design);
  const Xty = matVecMul(Xt, y);
  const XtXInv = invertMatrix(XtX);
  if (!XtXInv) {
    return { coefficients: [0, ...Array(k).fill(0)], residualVariance: 0, nObs: n };
  }
  const coefficients = matVecMul(XtXInv, Xty);
  const predicted = matVecMul(design, coefficients);
  const residuals = y.map((yi, i) => yi - predicted[i]!);
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const df = n - k - 1;
  const residualVariance = df > 0 ? ssRes / df : 0;
  return { coefficients, residualVariance, nObs: n };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute single-factor OLS exposure.
 * Model: returns = alpha + beta * factor + epsilon
 */
export function computeFactorExposure(
  returns: number[],
  factorValues: number[],
  factorName = 'factor',
): FactorExposure {
  const n = Math.min(returns.length, factorValues.length);
  if (n < 3) {
    return { factor: factorName, exposure: 0, tStat: 0, significant: false };
  }
  const y = returns.slice(0, n);
  const X = factorValues.slice(0, n).map((v) => [v]);
  const { coefficients, residualVariance } = ols(y, X);
  const beta = coefficients[1]!;
  const XtX = invertMatrix(matMul(transpose(X), X));
  const se = residualVariance > 0 && XtX
    ? Math.sqrt(residualVariance * XtX[0]![0]!)
    : 0;
  const tStat = se > 0 ? beta / se : 0;
  return {
    factor: factorName,
    exposure: beta,
    tStat,
    significant: Math.abs(tStat) > 2,
  };
}

/**
 * Multi-factor OLS regression.
 * Model: returns = alpha + sum(beta_i * factor_i) + epsilon
 */
export function multiFactorAnalysis(
  returns: number[],
  factors: Factor[],
): FactorAnalysisResult {
  if (factors.length === 0 || returns.length < 3) {
    return { exposures: [], rSquared: 0, nObs: returns.length };
  }
  const n = returns.length;
  const X = factors.map((f) => f.values.slice(0, n));
  const y = returns.slice(0, n);
  const k = factors.length;
  const design = y.map((_, i) => X.map((col) => col[i]!));
  const { coefficients, residualVariance, nObs } = ols(y, design);
  const predicted = design.map((row) =>
    row.reduce((s, val, j) => s + val * coefficients[j + 1]!, 0) + coefficients[0]!,
  );
  const ssRes = y.reduce((s, yi, i) => s + (yi - predicted[i]!) ** 2, 0);
  const yMean = y.reduce((s, yi) => s + yi, 0) / n;
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  // Compute (X'X)^{-1} from the full design matrix (with intercept) for correct SEs.
  const fullDesign = design.map((row) => [1, ...row]);
  const fullXtX = matMul(transpose(fullDesign), fullDesign);
  const fullXtXInv = invertMatrix(fullXtX);
  const exposures: FactorExposure[] = factors.map((f, i) => {
    const beta = coefficients[i + 1]!;
    const se = residualVariance > 0 && fullXtXInv
      ? Math.sqrt(residualVariance * fullXtXInv[i + 1]![i + 1]!)
      : 0;
    const tStat = se > 0 ? beta / se : 0;
    return {
      factor: f.name,
      exposure: beta,
      tStat,
      significant: Math.abs(tStat) > 2,
    };
  });
  return { exposures, rSquared, nObs };
}

/**
 * Rank factors by absolute t-stat (strongest first).
 */
export function rankFactorsByExposure(
  returns: number[],
  factors: Factor[],
): FactorExposure[] {
  return multiFactorAnalysis(returns, factors)
    .exposures.sort((a, b) => Math.abs(b.tStat) - Math.abs(a.tStat));
}
