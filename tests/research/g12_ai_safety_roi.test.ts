// Gate G12 Verification Suite — AI Zero-Order Authority, 50-Sample Red-Team, & 3-Arm Net-ROI Ablation
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TOOLS,
  evaluateThreeArmNetRoi,
  isAllowlistedTool,
  NO_ORDER_FIELDS,
  parseDecisionProposal,
  sanitizeUntrusted,
} from '@/tree/research/tradingagents';
import {
  FailureDiagnosisSchema,
  FeatureProposalSchema,
  HypothesisProposalSchema,
} from '@/forest/alpha/research-agent/schemas';
import {
  buildOfflineCriticAblationArms,
  buildRetailPerBarAblationArms,
  G12_REDTEAM_SAMPLES,
  generateG12Artifact,
} from '../../scripts/generate-g12-redteam';

const REPO_ROOT = path.resolve(__dirname, '../..');

function collectTsProductionFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '__tests__') {
      files.push(...collectTsProductionFiles(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      files.push(full);
    }
  }
  return files;
}

describe('Gate G12: 50-Sample Prompt-Injection Red-Team & Zero-Order Authority', () => {
  it('defines 50 distinct adversarial prompt-injection samples across 10 attack categories', () => {
    expect(G12_REDTEAM_SAMPLES.length).toBe(50);
    const uniqueIds = new Set(G12_REDTEAM_SAMPLES.map((s) => s.id));
    const uniquePayloads = new Set(G12_REDTEAM_SAMPLES.map((s) => s.untrustedInput));
    const categories = new Set(G12_REDTEAM_SAMPLES.map((s) => s.category));

    expect(uniqueIds.size).toBe(50);
    expect(uniquePayloads.size).toBe(50);
    expect(categories.size).toBe(10);
  });

  it('neutralizes 50/50 (100%) untrusted prompt-injection samples at sanitizeUntrusted gate', () => {
    let blockedCount = 0;
    for (const sample of G12_REDTEAM_SAMPLES) {
      const res = sanitizeUntrusted(sample.untrustedInput);
      expect(res.ok, `Expected sample ${sample.id} (${sample.category}) to be blocked`).toBe(false);
      if (!res.ok) {
        expect(res.reason).toContain('security gate:');
        blockedCount += 1;
      }
    }
    expect(blockedCount).toBe(50);
  });

  it('rejects 50/50 smuggled order-execution fields across TradingAgents and ResearchAgent schemas', () => {
    let emittedOrderFields = 0;

    for (const sample of G12_REDTEAM_SAMPLES) {
      const tradingAgentsAttempt = parseDecisionProposal({
        proposalId: `p_${sample.id}`,
        researchGoalId: 'goal_1',
        thesis: 'Clean thesis text',
        counterThesis: 'Clean counter thesis',
        evidence: [{ claim: 'c1', source: 's1' }],
        assumptions: ['a1'],
        invalidationConditions: ['i1'],
        catalyst: ['cat1'],
        horizon: 10,
        confidence: 0.5,
        proposedDirection: 'long',
        proposedPosition: 0.1,
        proposedEntry: 'passive bid',
        proposedExit: 'target',
        proposedStop: 'stop',
        riskFactors: ['r1'],
        dataProvenance: [{ dataset: 'd1', provider: 'p1', timestamp: '2026-10-01T00:00:00Z' }],
        agentProvenance: { agentRole: 'analyst', agentId: 'a1', providerId: 'openai', modelId: 'm1' },
        modelProvenance: { providerId: 'openai', modelId: 'm1', tier: 'FAST' },
        createdAt: '2026-10-01T00:00:00Z',
        [sample.smuggledOrderField]: sample.smuggledOrderValue,
      });
      expect(tradingAgentsAttempt.ok).toBe(false);
      if (tradingAgentsAttempt.ok) emittedOrderFields += 1;

      const researchAttempt = HypothesisProposalSchema.safeParse({
        id: `h_${sample.id}`,
        title: 'Clean Hypothesis',
        rationale: 'Clean rationale',
        domainCategory: 'microstructure',
        proposedMetrics: { sharpe: 1.2 },
        falsificationCriteria: ['OOS Sharpe < 0.5'],
        [sample.smuggledOrderField]: sample.smuggledOrderValue,
      });
      expect(researchAttempt.success).toBe(false);
      if (researchAttempt.success) emittedOrderFields += 1;
    }

    expect(emittedOrderFields).toBe(0);
    expect(
      FeatureProposalSchema.safeParse({
        name: 'f1',
        indicators: ['rsi_14'],
        combinationLogic: 'zscore',
        lookbackPeriods: [14],
        causalJustification: 'lagged bar close',
        placeOrder: true,
      }).success,
    ).toBe(false);
    expect(
      FailureDiagnosisSchema.safeParse({
        jobId: 'j1',
        primaryFailureReason: 'fee drag',
        contributingFactors: ['high turnover'],
        metricShortfalls: { sharpe: { expected: 1.0, actual: 0.2 } },
        recommendations: ['widen band'],
        leverage: 20,
      }).success,
    ).toBe(false);
  });

  it('enforces read/search/summarize-only tool firewall and blocks all order/mutation tools', () => {
    expect(ALLOWED_TOOLS.every((t) => ['read', 'search', 'summarize'].includes(t.kind))).toBe(true);
    for (const forbidden of [
      'place_order',
      'create_order',
      'cancel_order',
      'set_leverage',
      'withdraw_funds',
      'bypass_killswitch',
      ...NO_ORDER_FIELDS,
    ]) {
      expect(isAllowlistedTool(forbidden)).toBe(false);
    }
  });

  it('verifies statically that neither TradingAgents nor ResearchAgent imports or references order execution', () => {
    const dirsToScan = [
      path.join(REPO_ROOT, 'src/tree/research/tradingagents'),
      path.join(REPO_ROOT, 'src/forest/research/tradingagents'),
      path.join(REPO_ROOT, 'src/forest/alpha/research-agent'),
    ];
    const forbiddenOrderSymbols = [
      /\bOrderProvider\b/,
      /\bExchangeOrchestrator\b/,
      /\bBotOrderExecutor\b/,
      /\bLiveExchangeAdapter\b/,
      /from\s+['"]@\/tree\/exchange/,
      /from\s+['"]@\/land\/exchange-orchestration/,
      /from\s+['"]@\/tree\/bot/,
    ];

    const files = dirsToScan.flatMap(collectTsProductionFiles);
    expect(files.length).toBeGreaterThan(20);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of forbiddenOrderSymbols) {
        expect(
          pattern.test(content),
          `AI module ${path.relative(REPO_ROOT, file)} matched forbidden order symbol ${pattern}`,
        ).toBe(false);
      }
    }
  });

  it('pins committed artifacts/g12_ai_roi_redteam.json byte-for-byte with generator output', () => {
    const artifactPath = path.join(REPO_ROOT, 'artifacts', 'g12_ai_roi_redteam.json');
    expect(fs.existsSync(artifactPath)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const freshlyGenerated = generateG12Artifact();
    expect(onDisk).toEqual(freshlyGenerated);
  });
});

describe('Gate G12: 3-Arm Blind Net-of-Token-Cost ROI Evaluator', () => {
  it('disables per-bar Single-Model and Multi-Agent Debate (~7.2x tokens) when token drag erodes net ROI', () => {
    const result = evaluateThreeArmNetRoi(buildRetailPerBarAblationArms(), {
      startingCapitalUsd: 2_500,
      inputCostPer1MTokensUsd: 1.25,
      outputCostPer1MTokensUsd: 5.0,
      annualizationPeriodsPerYear: 26,
      minWindowsRequired: 16,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { armSummaries, aiDecisions, debateToSingleTokenMultiplier } = result.report;
    expect(armSummaries.DETERMINISTIC_BASELINE.totalTokenCostUsd).toBe(0);
    expect(debateToSingleTokenMultiplier).toBeCloseTo(7.2, 4);

    expect(aiDecisions.SINGLE_MODEL_CRITIC.verdict).toBe('DISABLE_NEGATIVE_NET_ROI');
    expect(aiDecisions.SINGLE_MODEL_CRITIC.incrementalNetReturnAfterTokensUsd).toBeLessThan(0);

    expect(aiDecisions.MULTI_AGENT_DEBATE.verdict).toBe('DISABLE_NEGATIVE_NET_ROI');
    expect(aiDecisions.MULTI_AGENT_DEBATE.incrementalNetReturnAfterTokensUsd).toBeCloseTo(-89.68, 2);
  });

  it('approves KEEP_READ_ONLY_CRITIC only when net-of-token Sharpe, net USD, and zero-order authority all hold', () => {
    const offline = evaluateThreeArmNetRoi(buildOfflineCriticAblationArms(), {
      startingCapitalUsd: 25_000,
      inputCostPer1MTokensUsd: 1.25,
      outputCostPer1MTokensUsd: 5.0,
      annualizationPeriodsPerYear: 26,
      minWindowsRequired: 16,
    });

    expect(offline.ok).toBe(true);
    if (!offline.ok) return;

    expect(offline.report.aiDecisions.SINGLE_MODEL_CRITIC.verdict).toBe('KEEP_READ_ONLY_CRITIC');
    expect(offline.report.aiDecisions.SINGLE_MODEL_CRITIC.incrementalSharpeAfterTokens).toBeGreaterThan(0);
    expect(offline.report.aiDecisions.SINGLE_MODEL_CRITIC.incrementalNetReturnAfterTokensUsd).toBeGreaterThan(0);
    expect(offline.report.aiDecisions.SINGLE_MODEL_CRITIC.orderAuthorityCount).toBe(0);

    expect(offline.report.aiDecisions.MULTI_AGENT_DEBATE.verdict).toBe('DISABLE_NEGATIVE_NET_ROI');
  });

  it('fails closed with DISABLE_NEGATIVE_NET_ROI if orderAuthorityCount > 0 even with positive Sharpe', () => {
    const arms = buildOfflineCriticAblationArms().map((arm) =>
      arm.arm === 'SINGLE_MODEL_CRITIC'
        ? {
            ...arm,
            windows: arm.windows.map((w, idx) => (idx === 0 ? { ...w, orderAuthorityCount: 1 } : w)),
          }
        : arm,
    );

    const res = evaluateThreeArmNetRoi(arms, {
      startingCapitalUsd: 25_000,
      inputCostPer1MTokensUsd: 1.25,
      outputCostPer1MTokensUsd: 5.0,
      annualizationPeriodsPerYear: 26,
      minWindowsRequired: 16,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.aiDecisions.SINGLE_MODEL_CRITIC.verdict).toBe('DISABLE_NEGATIVE_NET_ROI');
    expect(res.report.aiDecisions.SINGLE_MODEL_CRITIC.rationale).toContain('orderAuthorityCount=1');
  });

  it('rejects misaligned OOS window IDs or non-zero baseline tokens', () => {
    const baseArms = buildOfflineCriticAblationArms();
    const misaligned = baseArms.map((a) =>
      a.arm === 'MULTI_AGENT_DEBATE'
        ? { ...a, windows: a.windows.map((w) => ({ ...w, windowId: `${w.windowId}_DIFF` })) }
        : a,
    );
    expect(evaluateThreeArmNetRoi(misaligned).ok).toBe(false);

    const dirtyBaseline = baseArms.map((a) =>
      a.arm === 'DETERMINISTIC_BASELINE'
        ? { ...a, windows: a.windows.map((w) => ({ ...w, promptTokens: 10 })) }
        : a,
    );
    expect(evaluateThreeArmNetRoi(dirtyBaseline).ok).toBe(false);
  });
});
