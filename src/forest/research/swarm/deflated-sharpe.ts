// Deflated Sharpe Ratio (DSR) & Multiple-Testing Penalization
// Mitigates data snooping and false discovery in autonomous alpha research swarms
// Reference: Bailey, Borwein, López de Prado, Zhu (2014)

export interface DeflatedSharpeInput {
  readonly estimatedSharpe: number;
  readonly sampleLength: number; // Number of return observations
  readonly skewness?: number; // Return distribution skewness (default 0)
  readonly kurtosis?: number; // Return distribution kurtosis (default 3 for normal)
  readonly numTrials: number; // Cumulative number of strategies tested (N)
  readonly varianceOfTrials?: number; // Variance across trial Sharpe ratios (default 0.5)
}

export interface DeflatedSharpeResult {
  readonly deflatedSharpeRatio: number; // Value in [0, 1] representing p-value / confidence
  readonly expectedMaxSharpe: number; // Benchmark Sharpe threshold given N trials
  readonly isSignificant: boolean; // True if DSR >= confidenceLevel (e.g., 0.95)
}

export function computeExpectedMaxSharpe(numTrials: number, varianceOfSharpe = 0.5): number {
  if (numTrials <= 1) return 0;
  // Approximation of E[max_N] under Gaussian trials
  const eulerMascheroni = 0.5772156649;
  const sqrtLogN = Math.sqrt(2 * Math.log(numTrials));
  const zScore = sqrtLogN - (Math.log(Math.PI) + Math.log(Math.log(numTrials))) / (2 * sqrtLogN);
  const expectedZ = Math.max(0, zScore + eulerMascheroni / sqrtLogN);
  return expectedZ * Math.sqrt(varianceOfSharpe);
}

function standardNormalCdf(x: number): number {
  // Approximation of standard normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

export function computeDeflatedSharpe(
  input: DeflatedSharpeInput,
  confidenceLevel = 0.95,
): DeflatedSharpeResult {
  const {
    estimatedSharpe,
    sampleLength,
    skewness = 0,
    kurtosis = 3,
    numTrials,
    varianceOfTrials = 0.5,
  } = input;

  if (sampleLength <= 1) {
    return { deflatedSharpeRatio: 0, expectedMaxSharpe: 0, isSignificant: false };
  }

  const expectedMaxSharpe = computeExpectedMaxSharpe(numTrials, varianceOfTrials);

  // Standard error of Sharpe ratio considering non-normality
  const seTerm =
    1 -
    skewness * estimatedSharpe +
    ((kurtosis - 1) / 4) * Math.pow(estimatedSharpe, 2);
  const standardError = Math.sqrt(Math.max(1e-6, seTerm) / (sampleLength - 1));

  const z = (estimatedSharpe - expectedMaxSharpe) / standardError;
  const deflatedSharpeRatio = standardNormalCdf(z);

  return {
    deflatedSharpeRatio,
    expectedMaxSharpe,
    isSignificant: deflatedSharpeRatio >= confidenceLevel,
  };
}
