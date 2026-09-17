// Pure OLS factor exposure — no side effects, no external deps.
// Implements single and multi-factor regression via matrix operations.

import { invertMatrix, matMul, ols, transpose } from './ols-core';
import type {
  Factor,
  FactorAnalysisResult,
  FactorExposure,
} from './types';

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
