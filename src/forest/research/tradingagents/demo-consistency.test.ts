// Demo consistency tests — re-run the deterministic deliberation pipeline and
// verify the committed artifacts (plans/reports JSON + docs markdown) are
// byte-identical to a fresh run, carry the D11 honesty label, and satisfy
// the Σ≡N invariant.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runDeliberation } from './run-deliberation';
import { buildDemoConfig } from './demo-config';
import {
  buildDemoJsonPayload,
  buildDemoMarkdown,
  D11_HONESTY_LABEL,
  computeProvenanceAccounting,
} from './demo-report-builder';

const JSON_ARTIFACT = 'plans/reports/tradingagents-deliberation-report.json';
const MD_ARTIFACT = 'docs/tradingagents-deliberation-report.md';

describe('deliberation demo consistency', () => {
  it('runs the demo pipeline successfully', async () => {
    const result = await runDeliberation(buildDemoConfig());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.totals.total).toBe(result.report.stageResults.length);
    }
  });

  it('committed JSON artifact is byte-identical to a fresh run', async () => {
    const result = await runDeliberation(buildDemoConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fresh = JSON.stringify(buildDemoJsonPayload(result.report, result.decisionLog), null, 2);
    const committed = readFileSync(JSON_ARTIFACT, 'utf8');
    expect(fresh).toBe(committed);
  });

  it('committed markdown artifact is byte-identical to a fresh run', async () => {
    const result = await runDeliberation(buildDemoConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fresh = buildDemoMarkdown(result.report);
    const committed = readFileSync(MD_ARTIFACT, 'utf8');
    expect(fresh).toBe(committed);
  });

  it('D11 honesty label is present in both committed artifacts', () => {
    const json = readFileSync(JSON_ARTIFACT, 'utf8');
    const md = readFileSync(MD_ARTIFACT, 'utf8');
    expect(json).toContain(D11_HONESTY_LABEL);
    expect(md).toContain(D11_HONESTY_LABEL);
  });

  it('committed JSON satisfies the Σ≡N invariant', () => {
    const parsed = JSON.parse(readFileSync(JSON_ARTIFACT, 'utf8')) as {
      report: { totals: { completed: number; failed: number; skipped: number; rejected: number; total: number }; stageResults: unknown[] };
    };
    const t = parsed.report.totals;
    expect(t.completed + t.failed + t.skipped + t.rejected).toBe(parsed.report.stageResults.length);
    expect(t.total).toBe(parsed.report.stageResults.length);
  });

  it('provenance accounting sums match the report records', async () => {
    const result = await runDeliberation(buildDemoConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const accounting = computeProvenanceAccounting(result.report);
    expect(accounting.callCount).toBe(result.report.modelProvenance.length);
    expect(accounting.totalTokens).toBe(accounting.totalPromptTokens + accounting.totalCompletionTokens);
    const tierCalls = Object.values(accounting.byTier).reduce((sum, v) => sum + v.calls, 0);
    expect(tierCalls).toBe(accounting.callCount);
  });
});
