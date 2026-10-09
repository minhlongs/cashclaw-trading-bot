import type { ResearchReport } from './generator';

export function buildRecommendations(report: ResearchReport): string[] {
  const recs: string[] = [];
  if (report.summary.sharpe !== null && report.summary.sharpe < 0.5) {
    recs.push('Sharpe ratio below 0.5 — strategy not viable for live trading');
  }
  if (report.summary.maxDrawdown > 0.2) {
    recs.push('Max drawdown exceeds 20% — reduce position size or tighten stops');
  }
  const profitableRegimes = Object.entries(report.regimeAnalysis).filter(
    ([, entry]) => entry.trades > 0 && entry.avgPnL > 0,
  );
  if (profitableRegimes.length === 1) {
    const [label] = profitableRegimes[0]!;
    recs.push(`Only ${label} is profitable — deploy as regime-conditional strategy only`);
  } else if (profitableRegimes.length === 0) {
    recs.push('No profitable regimes detected — revisit feature set or entry rules');
  }
  return recs;
}
