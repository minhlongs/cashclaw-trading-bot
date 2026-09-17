// Pure OLS regression core — matrix helpers + OLS solver.
// Consumed only by ./analysis.ts — not re-exported from the barrel.

// ── Matrix Helpers ─────────────────────────────────────────────────────────

/** Transpose a matrix (rows become columns). */
export function transpose(m: number[][]): number[][] {
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
export function matMul(a: number[][], b: number[][]): number[][] {
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
export function matVecMul(a: number[][], v: number[]): number[] {
  return a.map((row) => row.reduce((s, val, i) => s + val * v[i]!, 0));
}

/** Invert a small matrix via Gauss-Jordan elimination. Returns null when singular. */
export function invertMatrix(m: number[][]): number[][] | null {
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
export function ols(
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
