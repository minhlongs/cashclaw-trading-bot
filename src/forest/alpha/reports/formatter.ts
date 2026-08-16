// Report Formatters
// Converts ResearchReport into Markdown or JSON strings.

import type { ResearchReport } from './generator';

// ── Markdown ─────────────────────────────────────────────────────────────────

export function formatMarkdown(report: ResearchReport): string {
  const lines: string[] = [];

  lines.push(`# ${report.title}`);
  lines.push(`**Generated:** ${report.generatedAt}  `);
  lines.push(`**Experiment ID:** \`${report.experimentId}\``);
  lines.push('');

  lines.push('## Summary');
  lines.push(
    `| Metric | Value |\n|--------|-------|\n| Total Return | ${report.summary.totalReturn.toFixed(4)} |\n| Net PnL | ${report.summary.netPnl.toFixed(4)} |\n| Sharpe | ${report.summary.sharpe?.toFixed(4) ?? 'N/A'} |\n| Max Drawdown | ${(report.summary.maxDrawdown * 100).toFixed(2)}% |\n| vs Baseline | ${report.summary.vsBaseline?.toFixed(4) ?? 'N/A'} |`,
  );
  lines.push('');

  lines.push('## Recommendations');
  if (report.recommendations.length === 0) {
    lines.push('_No recommendations — metrics look acceptable._');
  } else {
    for (const r of report.recommendations) {
      lines.push(`- ${r}`);
    }
  }
  lines.push('');

  lines.push('## Regime Analysis');
  lines.push(
    `| Regime | Trades | Win Rate | Avg PnL |\n|--------|--------|----------|---------|`,
  );
  for (const [regime, entry] of Object.entries(report.regimeAnalysis)) {
    lines.push(
      `| ${regime} | ${entry.trades} | ${(entry.winRate * 100).toFixed(1)}% | ${entry.avgPnL.toFixed(4)} |`,
    );
  }
  lines.push('');

  lines.push('## Attribution — Top Contributor');
  lines.push(`- **${report.attribution.TopContributor}** (${(report.attribution.diversificationScore * 100).toFixed(1)}% concentration)`);
  lines.push('');

  return lines.join('\n');
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function formatJSON(report: ResearchReport): string {
  return JSON.stringify(report, null, 2);
}