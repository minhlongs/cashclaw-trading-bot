import type { DataQualityAssessmentReport, QualityViolation } from './types';

function formatTimestamp(timestamp?: number): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) {
    return 'N/A';
  }
  try {
    return `${timestamp} (${new Date(timestamp).toISOString()})`;
  } catch {
    return `${timestamp}`;
  }
}

function formatViolationDetails(details: Readonly<Record<string, unknown>>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    lines.push(`  - **${key}**: \`${JSON.stringify(value)}\``);
  }
  return lines;
}

function formatViolationBlock(violation: QualityViolation, index: number): string[] {
  const lines: string[] = [
    `### Violation ${index + 1}: \`${violation.dimension}\``,
    `- **Message**: ${violation.message}`,
    `- **Index**: ${violation.index !== undefined ? violation.index : 'N/A'}`,
    `- **Timestamp**: ${formatTimestamp(violation.timestamp)}`,
  ];

  const detailLines = formatViolationDetails(violation.details);
  if (detailLines.length > 0) {
    lines.push('- **Details**:');
    lines.push(...detailLines);
  }

  return lines;
}

/**
 * Generates human-readable markdown diagnostic report from a DataQualityAssessmentReport.
 * Details violation indices, timestamps, and actual vs threshold values.
 */
export function generateDataQualityReport(report: DataQualityAssessmentReport): string {
  const { summary, validationResult } = report;
  const isoDate = new Date(report.evaluatedAt).toISOString();

  const lines: string[] = [
    '# Data Quality Assessment Report',
    '',
    '## Metadata',
    `| Attribute | Value |`,
    `|---|---|`,
    `| Symbol | **${report.symbol}** |`,
    `| Timeframe | **${report.timeframe}** |`,
    `| Evaluated At | ${isoDate} (\`${report.evaluatedAt}\`) |`,
    `| Status | **${report.status}** |`,
    `| Total Candles | ${validationResult.totalCandles} |`,
    '',
    '## Summary Metrics',
    `| Metric | Count |`,
    `|---|---|`,
    `| Total Checks | ${summary.totalChecks} |`,
    `| Passed Checks | ${summary.passedChecks} |`,
    `| Failed Checks | ${summary.failedChecks} |`,
    `| Total Violations | ${summary.violationCount} |`,
    '',
    '## Dimension Checks',
    `| Dimension | Status | Violations |`,
    `|---|---|---|`,
  ];

  for (const check of validationResult.checkResults) {
    const statusLabel = check.passed ? 'PASS' : 'FAIL';
    lines.push(`| \`${check.dimension}\` | ${statusLabel} | ${check.violations.length} |`);
  }

  lines.push('', '## Diagnostics & Violations');

  if (validationResult.violations.length === 0) {
    lines.push('No data quality violations detected.');
  } else {
    validationResult.violations.forEach((violation, idx) => {
      lines.push(...formatViolationBlock(violation, idx));
      lines.push('');
    });
  }

  lines.push('## Recommendations');
  for (const rec of report.recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push('');

  return lines.join('\n');
}

