// Demo report builder — pure functions producing the JSON payload and the
// bilingual markdown report from a DeliberationReport. No I/O here; the
// script writes the returned strings. Includes the D11 honesty label and
// token-cost/latency accounting from model provenance.

import { summarizeDeliberationReport, type DeliberationReport } from './report-types';

/** D11 honesty label — must appear in every demo artifact. */
export const D11_HONESTY_LABEL =
  'This demo uses DeterministicFixtureProvider (D11 TEST seam) — not real LLM deliberation quality.';

/** Aggregate token/latency accounting from model provenance records. */
export interface ProvenanceAccounting {
  readonly callCount: number;
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly totalTokens: number;
  readonly totalLatencyMs: number;
  readonly byTier: Readonly<Record<string, { calls: number; tokens: number }>>;
}

/** Sum token/latency accounting across all provenance records. */
export function computeProvenanceAccounting(report: DeliberationReport): ProvenanceAccounting {
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalLatencyMs = 0;
  const byTier: Record<string, { calls: number; tokens: number }> = {};
  for (const record of report.modelProvenance) {
    const prompt = record.provenance.promptTokens ?? 0;
    const completion = record.provenance.completionTokens ?? 0;
    totalPromptTokens += prompt;
    totalCompletionTokens += completion;
    totalLatencyMs += record.provenance.latencyMs ?? 0;
    const tier = record.provenance.tier;
    const bucket = byTier[tier] ?? { calls: 0, tokens: 0 };
    byTier[tier] = { calls: bucket.calls + 1, tokens: bucket.tokens + prompt + completion };
  }
  return {
    callCount: report.modelProvenance.length,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    totalLatencyMs,
    byTier,
  };
}

/** Build the committed JSON artifact payload. */
export function buildDemoJsonPayload(report: DeliberationReport, decisionLog: string): unknown {
  return {
    honestyLabel: D11_HONESTY_LABEL,
    summary: summarizeDeliberationReport(report),
    report,
    decisionLog: JSON.parse(decisionLog),
    accounting: computeProvenanceAccounting(report),
  };
}

/** Build the bilingual (Vietnamese + English) markdown report. */
export function buildDemoMarkdown(report: DeliberationReport): string {
  const t = report.totals;
  const accounting = computeProvenanceAccounting(report);
  const tierRows = Object.entries(accounting.byTier)
    .map(([tier, v]) => `| ${tier} | ${v.calls} | ${v.tokens} |`)
    .join('\n');
  const stageRows = report.stageResults
    .map((s) => `| ${s.stage} | ${s.outcome} | ${s.reasons.join('; ') || '—'} |`)
    .join('\n');

  return `# TradingAgents Deliberation Report / Báo cáo Deliberation TradingAgents

> **D11 Honesty Label / Nhãn trung thực D11:** ${D11_HONESTY_LABEL}
> Demo này dùng DeterministicFixtureProvider (D11 TEST seam) — KHÔNG phải chất lượng deliberation LLM thật.

## Summary / Tóm tắt
- Research Goal ID: \`${report.researchGoalId}\`
- Proposal ID: \`${report.proposalId}\`
- Created At / Tạo lúc: ${report.createdAt}
- ${summarizeDeliberationReport(report)}

## Stage Results / Kết quả từng giai đoạn
| Stage / Giai đoạn | Outcome / Kết quả | Reasons / Lý do |
|---|---|---|
${stageRows}

**Σ≡N invariant / Bất biến Σ≡N:** completed(${t.completed}) + failed(${t.failed}) + skipped(${t.skipped}) + rejected(${t.rejected}) = ${t.completed + t.failed + t.skipped + t.rejected} ≡ total(${t.total})

## Decision Proposal / Đề xuất quyết định
- Thesis / Luận điểm: ${report.decisionProposal.thesis}
- Counter-thesis / Luận điểm đối lập: ${report.decisionProposal.counterThesis}
- Direction / Hướng: ${report.decisionProposal.proposedDirection}
- Confidence / Độ tin cậy: ${report.decisionProposal.confidence}
- Horizon / Tầm nhìn: ${report.decisionProposal.horizon} bars

## Hypotheses / Giả thuyết
- Count / Số lượng: ${report.hypotheses.length}
- Experiment specs / Đặc tả thí nghiệm: ${report.experimentSpecs.length}

## Model Provenance Accounting / Kế toán provenance mô hình
- Calls / Số lần gọi: ${accounting.callCount}
- Prompt tokens: ${accounting.totalPromptTokens}
- Completion tokens: ${accounting.totalCompletionTokens}
- Total tokens / Tổng token: ${accounting.totalTokens}
- Total latency / Tổng độ trễ: ${accounting.totalLatencyMs} ms

| Tier / Tầng | Calls / Số lần gọi | Tokens / Token |
|---|---|---|
${tierRows}

## Safety / An toàn
- PAPER/BACKTEST ONLY — no real orders / CHỈ PAPER/BACKTEST — không đặt lệnh thật.
- LLM output is advisory only; deterministic CashClaw engines decide sizing/risk.
- Kết quả LLM chỉ mang tính tham vấn; engine CashClaw tất định quyết định sizing/rủi ro.
`;
}
