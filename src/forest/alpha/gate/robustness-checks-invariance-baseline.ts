import type {
  GateCheck,
  CandidateBaselineMetrics,
  BenchmarkMetrics,
  ReproducibleHashDetails,
} from './types';

/** Check 14: baselineComparison — Candidate outperforms Buy & Hold and Random Entry on Sharpe and Net PnL. */
export function checkBaselineComparison(
  candidate: CandidateBaselineMetrics,
  buyHold: BenchmarkMetrics,
  randomEntry: BenchmarkMetrics,
): GateCheck {
  const candValid = Number.isFinite(candidate.sharpe) && Number.isFinite(candidate.netPnl);
  const bhSharpeBeaten = buyHold.sharpe === null || candidate.sharpe > buyHold.sharpe;
  const bhPnlBeaten = Number.isFinite(buyHold.netPnl) && candidate.netPnl > buyHold.netPnl;
  const reSharpeBeaten = randomEntry.sharpe === null || candidate.sharpe > randomEntry.sharpe;
  const rePnlBeaten = Number.isFinite(randomEntry.netPnl) && candidate.netPnl > randomEntry.netPnl;
  const passed = candValid && bhSharpeBeaten && bhPnlBeaten && reSharpeBeaten && rePnlBeaten;

  const bhSharpeStr = buyHold.sharpe !== null ? buyHold.sharpe.toFixed(2) : 'null';
  const reSharpeStr = randomEntry.sharpe !== null ? randomEntry.sharpe.toFixed(2) : 'null';
  const detail = candValid
    ? `Candidate (Sharpe: ${candidate.sharpe.toFixed(2)}, PnL: ${candidate.netPnl.toFixed(2)}) vs BH (Sharpe: ${bhSharpeStr}, PnL: ${buyHold.netPnl.toFixed(2)}) & Random (Sharpe: ${reSharpeStr}, PnL: ${randomEntry.netPnl.toFixed(2)})`
    : 'Invalid candidate metrics for baseline comparison';

  return { name: 'baseline_comparison', passed, actual: candValid ? candidate.netPnl : null, threshold: 'beats_both', detail };
}

/** Check 15: reproducibleHash — Canonical experiment hash over git commit + seed + config verified. */
export function checkReproducibleHash(
  hashMatches: boolean,
  details?: ReproducibleHashDetails | string,
): GateCheck {
  const passed = hashMatches === true;
  let detail: string;
  if (typeof details === 'string') {
    detail = details;
  } else if (details && typeof details === 'object') {
    detail = passed
      ? `Canonical experiment hash verified: ${details.recordedHash ?? 'match'}`
      : `Mismatch: recorded ${details.recordedHash ?? 'unknown'} vs computed ${details.expectedHash ?? 'unknown'}`;
  } else {
    detail = passed ? 'Canonical experiment hash verified' : 'Canonical experiment hash mismatch';
  }
  return { name: 'reproducible_hash', passed, actual: hashMatches, threshold: true, detail };
}
