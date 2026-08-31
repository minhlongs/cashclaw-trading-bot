// Demo Report Builder tests — covers computeProvenanceAccounting,
// buildDemoJsonPayload, and buildDemoMarkdown branches.

import { describe, expect, it } from 'vitest';
import {
  computeProvenanceAccounting,
  buildDemoJsonPayload,
  buildDemoMarkdown,
  D11_HONESTY_LABEL,
} from './demo-report-builder';
import type { DeliberationReport, StageResult } from './report-types';
import type { ModelProvenanceRecord } from '@/tree/research/tradingagents/model-provenance';
import { buildLineage } from '@/tree/research/evidence/lineage';
import type { DecisionProposal } from '@/tree/research/tradingagents/decision-contract';

function makeProvenance(overrides: Partial<ModelProvenanceRecord> = {}): ModelProvenanceRecord {
  return {
    agentRole: 'analyst',
    task: 'summarization',
    provenance: {
      providerId: 'Anthropic',
      modelId: 'fixture-reasoning',
      tier: 'REASONING',
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 10,
      ...overrides.provenance,
    },
    ...overrides,
  };
}

function makeStageResult(stage: DeliberationReport['stageResults'][0]['stage'], outcome: StageResult['outcome'] = 'completed'): StageResult {
  return { stage, outcome, reasons: outcome === 'failed' ? ['some error'] : [] };
}

function makeReport(overrides: Partial<DeliberationReport> = {}): DeliberationReport {
  const stageResults: StageResult[] = [
    makeStageResult('analyst-output'),
    makeStageResult('debate-output'),
    makeStageResult('research-synthesis'),
    makeStageResult('risk-proposal'),
    makeStageResult('portfolio-proposal'),
    makeStageResult('cashclaw-validation'),
  ];
  return {
    researchGoalId: 'goal-1',
    proposalId: 'prop-1',
    decisionProposal: {
      proposalId: 'prop-1',
      researchGoalId: 'goal-1',
      thesis: 'bull thesis',
      counterThesis: 'bear thesis',
      evidence: [{ claim: 'momentum persists', source: 'OOS backtest' }],
      assumptions: [],
      invalidationConditions: [],
      catalyst: [],
      horizon: 10,
      confidence: 0.7,
      proposedDirection: 'long',
      proposedPosition: 0.5,
      proposedEntry: '100',
      proposedExit: '110',
      proposedStop: '95',
      riskFactors: [],
      dataProvenance: [],
      agentProvenance: { agentRole: 'analyst', agentId: 'analyst-1', providerId: 'Anthropic', modelId: 'fixture-reasoning' },
      modelProvenance: { providerId: 'Anthropic', modelId: 'fixture-reasoning', tier: 'REASONING' },
      createdAt: '2026-08-26T00:00:00.000Z',
    },
    debateState: {
      researchGoalId: 'goal-1',
      proposalId: 'prop-1',
      rounds: [],
      status: 'complete',
    },
    hypotheses: [],
    experimentSpecs: [],
    lineage: buildLineage([]),
    riskAdvisory: {
      goalId: 'goal-1',
      proposalId: 'prop-1',
      advisories: [],
      summary: '',
    },
    portfolioResult: {
      portfolioResult: {
        positions: [],
        grossExposure: 0,
        netExposure: 0,
        totalTurnover: 0,
        riskAdjustments: [],
        drawdownDeRisked: false,
      },
      rejected: false,
      rejectionReasons: [],
    },
    modelProvenance: [
      makeProvenance({ agentRole: 'analyst', task: 'summarization', provenance: { providerId: 'Anthropic', modelId: 'fixture-reasoning', tier: 'REASONING', promptTokens: 100, completionTokens: 50, latencyMs: 10 } }),
      makeProvenance({ agentRole: 'bull-researcher', task: 'debate', provenance: { providerId: 'Anthropic', modelId: 'fixture-reasoning', tier: 'REASONING', promptTokens: 200, completionTokens: 100, latencyMs: 20 } }),
      makeProvenance({ agentRole: 'bear-researcher', task: 'debate', provenance: { providerId: 'Anthropic', modelId: 'fixture-reasoning', tier: 'REASONING', promptTokens: 200, completionTokens: 100, latencyMs: 20 } }),
      makeProvenance({ agentRole: 'risk-advisor', task: 'summarization', provenance: { providerId: 'Anthropic', modelId: 'fixture-fast', tier: 'FAST', promptTokens: 50, completionTokens: 25, latencyMs: 5 } }),
    ],
    toolProvenance: [],
    stageResults,
    totals: {
      completed: 6,
      failed: 0,
      skipped: 0,
      rejected: 0,
      total: 6,
    },
    createdAt: '2026-08-26T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeProvenanceAccounting', () => {
  it('sums tokens and latency across all provenance records', () => {
    const report = makeReport();
    const accounting = computeProvenanceAccounting(report);
    expect(accounting.callCount).toBe(4);
    expect(accounting.totalPromptTokens).toBe(550); // 100+200+200+50
    expect(accounting.totalCompletionTokens).toBe(275); // 50+100+100+25
    expect(accounting.totalTokens).toBe(825);
    expect(accounting.totalLatencyMs).toBe(55); // 10+20+20+5
  });

  it('groups by tier correctly', () => {
    const report = makeReport();
    const accounting = computeProvenanceAccounting(report);
    // REASONING: 3 calls × (prompt + completion) = (100+50) + (200+100) + (200+100) = 750
    expect(accounting.byTier.REASONING).toEqual({ calls: 3, tokens: 750 });
    expect(accounting.byTier.FAST).toEqual({ calls: 1, tokens: 75 }); // 1 FAST call: 50+25 = 75
  });

  it('handles empty provenance array', () => {
    const report = makeReport({ modelProvenance: [] });
    const accounting = computeProvenanceAccounting(report);
    expect(accounting.callCount).toBe(0);
    expect(accounting.totalPromptTokens).toBe(0);
    expect(accounting.totalCompletionTokens).toBe(0);
    expect(accounting.totalTokens).toBe(0);
    expect(accounting.totalLatencyMs).toBe(0);
    expect(accounting.byTier).toEqual({});
  });

  it('handles missing provenance fields (undefined)', () => {
    const report = makeReport({
      modelProvenance: [
        makeProvenance({ provenance: { providerId: 'Anthropic', modelId: 'fixture-reasoning', tier: 'REASONING', promptTokens: undefined, completionTokens: undefined, latencyMs: undefined } }),
      ],
    });
    const accounting = computeProvenanceAccounting(report);
    expect(accounting.totalPromptTokens).toBe(0);
    expect(accounting.totalCompletionTokens).toBe(0);
    expect(accounting.totalLatencyMs).toBe(0);
  });
});

describe('buildDemoJsonPayload', () => {
  it('includes honesty label, summary, report, decisionLog, and accounting', () => {
    const report = makeReport();
    const decisionLog = JSON.stringify({ entries: [], tailHash: null });
    const payload = buildDemoJsonPayload(report, decisionLog) as Record<string, unknown>;
    expect(payload).toHaveProperty('honestyLabel', D11_HONESTY_LABEL);
    expect(payload).toHaveProperty('summary');
    expect(payload).toHaveProperty('report');
    expect(payload).toHaveProperty('decisionLog');
    expect(payload).toHaveProperty('accounting');
    expect(payload.accounting).toEqual(computeProvenanceAccounting(report));
  });

  it('parses decisionLog JSON string correctly', () => {
    const report = makeReport();
    const decisionLog = JSON.stringify({ entries: [{ kind: 'analyst-output' }], tailHash: 'abc' });
    const payload = buildDemoJsonPayload(report, decisionLog) as Record<string, unknown>;
    expect(payload.decisionLog).toEqual({ entries: [{ kind: 'analyst-output' }], tailHash: 'abc' });
  });
});

describe('buildDemoMarkdown', () => {
  it('includes bilingual headers and D11 honesty label', () => {
    const report = makeReport();
    const markdown = buildDemoMarkdown(report);
    expect(markdown).toContain('# TradingAgents Deliberation Report / Báo cáo Deliberation TradingAgents');
    expect(markdown).toContain(D11_HONESTY_LABEL);
    expect(markdown).toContain('Nhãn trung thực D11');
  });

  it('includes research goal ID and proposal ID', () => {
    const report = makeReport({ researchGoalId: 'custom-goal', proposalId: 'custom-prop' });
    const markdown = buildDemoMarkdown(report);
    expect(markdown).toContain('custom-goal');
    expect(markdown).toContain('custom-prop');
  });

  it('includes stage results table with outcomes and reasons', () => {
    const report = makeReport({
      stageResults: [
        makeStageResult('analyst-output', 'completed'),
        makeStageResult('debate-output', 'failed'),
        makeStageResult('research-synthesis', 'skipped'),
        makeStageResult('risk-proposal', 'rejected'),
        makeStageResult('portfolio-proposal', 'completed'),
        makeStageResult('cashclaw-validation', 'completed'),
      ],
      totals: { completed: 3, failed: 1, skipped: 1, rejected: 1, total: 6 },
    });
    const markdown = buildDemoMarkdown(report);
    expect(markdown).toContain('| analyst-output | completed | — |');
    expect(markdown).toContain('| debate-output | failed | some error |');
    expect(markdown).toContain('| research-synthesis | skipped | — |');
    // rejected outcome has empty reasons (—), not "some error" (that's only for 'failed')
    expect(markdown).toContain('| risk-proposal | rejected | — |');
  });

  it('includes Σ≡N invariant line', () => {
    const report = makeReport({
      stageResults: [
        makeStageResult('analyst-output', 'completed'),
        makeStageResult('debate-output', 'completed'),
        makeStageResult('research-synthesis', 'completed'),
        makeStageResult('risk-proposal', 'failed'),
        makeStageResult('portfolio-proposal', 'skipped'),
        makeStageResult('cashclaw-validation', 'skipped'),
      ],
      totals: { completed: 3, failed: 1, skipped: 2, rejected: 0, total: 6 },
    });
    const markdown = buildDemoMarkdown(report);
    // The markdown bold-formats the label: **Σ≡N invariant / Bất biến Σ≡N:**
    expect(markdown).toContain('**Σ≡N invariant / Bất biến Σ≡N:** completed(3) + failed(1) + skipped(2) + rejected(0) = 6 ≡ total(6)');
  });

  it('includes decision proposal details', () => {
    const report = makeReport({
      decisionProposal: {
        ...makeReport().decisionProposal,
        thesis: 'custom thesis',
        counterThesis: 'custom counter',
        proposedDirection: 'short',
        confidence: 0.85,
        horizon: 20,
      } as DecisionProposal,
    });
    const markdown = buildDemoMarkdown(report);
    expect(markdown).toContain('Thesis / Luận điểm: custom thesis');
    expect(markdown).toContain('Counter-thesis / Luận điểm đối lập: custom counter');
    expect(markdown).toContain('Direction / Hướng: short');
    expect(markdown).toContain('Confidence / Độ tin cậy: 0.85');
    expect(markdown).toContain('Horizon / Tầm nhìn: 20 bars');
  });

  it('includes hypotheses and experiment specs count', () => {
    const report = makeReport({
      hypotheses: [{}, {}] as any,
      experimentSpecs: [{}, {}, {}] as any,
    });
    const markdown = buildDemoMarkdown(report);
    expect(markdown).toContain('Count / Số lượng: 2');
    expect(markdown).toContain('Experiment specs / Đặc tả thí nghiệm: 3');
  });

  it('includes model provenance accounting table', () => {
    const report = makeReport();
    const markdown = buildDemoMarkdown(report);
    expect(markdown).toContain('| Tier / Tầng | Calls / Số lần gọi | Tokens / Token |');
    // REASONING: 3 calls × (prompt + completion) = (100+50) + (200+100) + (200+100) = 750
    expect(markdown).toContain('| REASONING | 3 | 750 |');
    expect(markdown).toContain('| FAST | 1 | 75 |');
  });

  it('includes safety section', () => {
    const report = makeReport();
    const markdown = buildDemoMarkdown(report);
    expect(markdown).toContain('PAPER/BACKTEST ONLY');
    expect(markdown).toContain('CHỈ PAPER/BACKTEST');
    expect(markdown).toContain('LLM output is advisory only');
  });
});