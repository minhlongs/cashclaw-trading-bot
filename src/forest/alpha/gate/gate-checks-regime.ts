import type { EvaluationReport } from '../evaluation/report';
import type { GateCheck } from './gate-checks-types';

export function checkSharpe(actual: number | null, threshold: number): GateCheck {
  const passed = actual !== null && actual >= threshold;
  return {
    name: 'min_sharpe',
    passed,
    actual: actual ?? -Infinity,
    threshold,
    detail: actual === null
      ? 'Sharpe is null (insufficient data) — fails'
      : `Sharpe ${actual.toFixed(2)} vs. minimum ${threshold}`,
  };
}

export function checkRegimeCoverage(
  byRegime: Record<string, Partial<EvaluationReport>>,
  threshold: number,
): GateCheck {
  const regimes = Object.keys(byRegime).filter((k) => byRegime[k] !== undefined && byRegime[k] !== null);
  const traded = regimes.filter((k) => (byRegime[k]?.numTrades ?? 0) > 0);
  const coverage = regimes.length === 0 ? 0 : traded.length / regimes.length;
  return {
    name: 'min_regime_coverage',
    passed: coverage >= threshold,
    actual: coverage,
    threshold,
    detail: `${traded.length}/${regimes.length} regimes traded vs. minimum ${(threshold * 100).toFixed(0)}%`,
  };
}
