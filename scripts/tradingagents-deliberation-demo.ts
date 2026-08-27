// TradingAgents deliberation demo — MANUAL ONLY.
// Runs the full deliberation pipeline on DeterministicFixtureProvider (D11
// labeled TEST seam — NOT real LLM quality) over a fixed ResearchGoal and
// injected data, then writes the committed JSON artifact + bilingual markdown
// report. Deterministic: re-running produces byte-identical output.
//
// Run: npx tsx scripts/tradingagents-deliberation-demo.ts
// Paper/backtest only; no orders; no tokens spent; no network.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runDeliberation } from '@/forest/research/tradingagents/run-deliberation';
import { buildDemoConfig } from '@/forest/research/tradingagents/demo-config';
import {
  buildDemoJsonPayload,
  buildDemoMarkdown,
  D11_HONESTY_LABEL,
} from '@/forest/research/tradingagents/demo-report-builder';

const REPORT_DIR = 'plans/reports';
const DOCS_DIR = 'docs';
const JSON_NAME = 'tradingagents-deliberation-report.json';
const MD_NAME = 'tradingagents-deliberation-report.md';

async function main(): Promise<void> {
  const config = buildDemoConfig();
  const result = await runDeliberation(config);
  if (!result.ok) {
    console.error(`deliberation failed: ${result.reasons.join('; ')}`);
    process.exit(1);
  }

  const jsonPayload = buildDemoJsonPayload(result.report, result.decisionLog);
  const markdown = buildDemoMarkdown(result.report);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, JSON_NAME);
  const mdPath = path.join(DOCS_DIR, MD_NAME);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2));
  fs.writeFileSync(mdPath, markdown);

  console.log(D11_HONESTY_LABEL);
  console.log(`artifact: ${jsonPath}`);
  console.log(`artifact: ${mdPath}`);
  console.log(`stages: ${result.report.totals.total} (completed ${result.report.totals.completed})`);
}

main().catch((err: unknown) => {
  console.error('demo crashed:', err);
  process.exit(1);
});
