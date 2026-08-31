// Deliberation helpers tests — pure JSON parsing + report assembly with
// fail-closed validation. No keys, no network; exercises the fail-closed
// parsing paths and Σ≡N invariant.

import { describe, expect, it } from 'vitest';
import { parseRiskScenarios, parsePortfolioProposal, finalizeDeliberationReport } from './run-deliberation-helpers';
import { DecisionLogWriter } from './decision-log';
import type { DebateToHypothesisResult } from './debate-to-hypothesis';
import type { ResearchGoal } from '@/tree/research/goals/types';
import type { StageResult } from './report-types';
import type { RiskAdvisorySet } from './risk-advisor';
import type { PortfolioAdvisorResult } from './portfolio-advisor';
import { buildLineage } from '@/tree/research/evidence/lineage';

const NOW = '2026-08-26T00:00:00.000Z';

const RESEARCH_GOAL: ResearchGoal = {
  id: 'goal-1',
  objective: 'Determine whether momentum persists in trending regime',
  universe: { id: 'universe-1', symbols: ['BTC-USD'], weighting: 'equal', rebalanceRule: 'daily' },
  timePeriod: { start: '2026-01-01T00:00:00.000Z', end: NOW },
  constraints: ['paper only'],
  evidenceRequirements: ['OOS evidence'],
  successCriteria: ['directional accuracy > 0.5'],
  failureCriteria: ['directional accuracy <= 0.5'],
  createdAt: NOW,
  createdBy: 'test',
};

function hypothesisResult(overrides: Partial<DebateToHypothesisResult> = {}): DebateToHypothesisResult {
  return {
    proposalId: 'prop-1',
    researchGoalId: 'goal-1',
    hypotheses: [],
    experimentSpecs: [],
    lineage: buildLineage([]),
    decisionProposal: { thesis: 'momentum persists' } as DebateToHypothesisResult['decisionProposal'],
    debateState: {
      researchGoalId: 'goal-1',
      proposalId: 'prop-1',
      rounds: [],
      status: 'complete',
    },
    modelProvenance: [],
    toolProvenance: [],
    ...overrides,
  };
}

function makeStage(stage: StageResult['stage'], outcome: StageResult['outcome']): StageResult {
  return { stage, outcome, reasons: [] };
}

describe('parseRiskScenarios', () => {
  it('parses a valid risk round into a RiskScenario', () => {
    const rounds = [
      {
        agentId: 'risk-aggressive',
        content: JSON.stringify({
          expectedRegime: 'TREND_UP',
          keyRisks: ['Regime shift', 'Liquidity gap'],
          failureConditions: ['Drawdown exceeds 5%'],
          maxAcceptableExposure: 0.6,
          liquidityConcern: 'moderate',
          volatilityConcern: 'high',
          correlationConcern: 'low',
        }),
      },
    ];
    const scenarios = parseRiskScenarios(rounds);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].view).toBe('aggressive');
    expect(scenarios[0].expectedRegime).toBe('TREND_UP');
    expect(scenarios[0].keyRisks).toEqual(['Regime shift', 'Liquidity gap']);
    expect(scenarios[0].maxAcceptableExposure).toBe(0.6);
  });

  it('skips rounds with invalid JSON', () => {
    const rounds = [{ agentId: 'risk-neutral', content: 'not-json' }];
    expect(parseRiskScenarios(rounds)).toEqual([]);
  });

  it('skips null JSON', () => {
    const rounds = [{ agentId: 'risk-neutral', content: 'null' }];
    expect(parseRiskScenarios(rounds)).toEqual([]);
  });

  it('skips non-object JSON (number)', () => {
    const rounds = [{ agentId: 'risk-neutral', content: '42' }];
    expect(parseRiskScenarios(rounds)).toEqual([]);
  });

  it('skips non-object JSON (string)', () => {
    const rounds = [{ agentId: 'risk-neutral', content: '"just a string"' }];
    expect(parseRiskScenarios(rounds)).toEqual([]);
  });

  it('applies defaults for missing fields', () => {
    const rounds = [{ agentId: 'risk-aggressive', content: '{}' }];
    const scenarios = parseRiskScenarios(rounds);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].expectedRegime).toBe('unknown');
    expect(scenarios[0].keyRisks).toEqual([]);
    expect(scenarios[0].maxAcceptableExposure).toBe(0.5);
    expect(scenarios[0].liquidityConcern).toBe('unknown');
  });

  it('filters non-string entries from keyRisks', () => {
    const rounds = [
      {
        agentId: 'risk-aggressive',
        content: JSON.stringify({ keyRisks: ['real', 42, null, 'also-real'] }),
      },
    ];
    const scenarios = parseRiskScenarios(rounds);
    expect(scenarios[0].keyRisks).toEqual(['real', 'also-real']);
  });

  it('handles multiple rounds', () => {
    const rounds = [
      { agentId: 'risk-aggressive', content: '{}' },
      { agentId: 'risk-neutral', content: '{}' },
      { agentId: 'risk-conservative', content: '{}' },
    ];
    const scenarios = parseRiskScenarios(rounds);
    expect(scenarios).toHaveLength(3);
    expect(scenarios.map((s) => s.view)).toEqual(['aggressive', 'neutral', 'conservative']);
  });
});

describe('parsePortfolioProposal', () => {
  it('parses a valid proposal into a PortfolioProposal', () => {
    const content = JSON.stringify({
      assets: ['alpha-momentum', 'alpha-value'],
      weights: [0.3, 0.2],
      hedge: 'volatility overlay',
      rebalance: 'weekly',
      exposure: 0.5,
      rationale: 'test rationale',
    });
    const proposal = parsePortfolioProposal(content, 'goal-1', 'prop-1', NOW);
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.proposalId).toBe('prop-1');
    expect(proposal.researchGoalId).toBe('goal-1');
    expect(proposal.assets).toHaveLength(2);
    expect(proposal.assets[0].asset).toBe('alpha-momentum');
    expect(proposal.assets[0].proposedWeight).toBe(0.3);
    expect(proposal.assets[1].proposedWeight).toBe(0.2);
    expect(proposal.hedge).toBe('volatility overlay');
    expect(proposal.exposure).toBe(0.5);
    expect(proposal.createdAt).toBe(NOW);
  });

  it('defaults proposedWeight to 0 when weights array is shorter than assets', () => {
    const content = JSON.stringify({ assets: ['alpha-momentum', 'alpha-value'], weights: [0.3] });
    const proposal = parsePortfolioProposal(content, 'goal-1', 'prop-1', NOW);
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.assets[0].proposedWeight).toBe(0.3);
    expect(proposal.assets[1].proposedWeight).toBe(0);
  });

  it('returns null for invalid JSON', () => {
    expect(parsePortfolioProposal('not-json', 'g', 'p', NOW)).toBeNull();
  });

  it('returns null for non-object JSON (number)', () => {
    expect(parsePortfolioProposal('42', 'g', 'p', NOW)).toBeNull();
  });

  it('returns null for null JSON', () => {
    expect(parsePortfolioProposal('null', 'g', 'p', NOW)).toBeNull();
  });

  it('filters non-string assets and non-number weights', () => {
    const content = JSON.stringify({ assets: ['alpha-momentum', 42, null], weights: ['bad', 0.3] });
    const proposal = parsePortfolioProposal(content, 'goal-1', 'prop-1', NOW);
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.assets.map((a) => a.asset)).toEqual(['alpha-momentum']);
    expect(proposal.assets[0].proposedWeight).toBe(0.3);
  });

  it('applies defaults for missing optional fields', () => {
    const proposal = parsePortfolioProposal('{"assets": []}', 'goal-1', 'prop-1', NOW);
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.hedge).toBe('');
    expect(proposal.rebalance).toBe('');
    expect(proposal.exposure).toBe(0);
  });
});

describe('finalizeDeliberationReport', () => {
  it('assembles a report with computed totals and a valid decision log', async () => {
    const stages = [
      makeStage('analyst-output', 'completed'),
      makeStage('debate-output', 'completed'),
    ];
    const result = await finalizeDeliberationReport({
      researchGoal: RESEARCH_GOAL,
      proposalId: 'prop-1',
      nowIso: NOW,
      hypothesisResult: hypothesisResult(),
      riskAdvisory: null,
      portfolioResult: null,
      stageResults: stages,
      writer: new DecisionLogWriter(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.researchGoalId).toBe('goal-1');
    expect(result.report.proposalId).toBe('prop-1');
    expect(result.report.totals.completed).toBe(2);
    expect(result.report.totals.total).toBe(2);
    const parsed = JSON.parse(result.decisionLog);
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(parsed.entries.length).toBeGreaterThan(0);
  });

  it('Σ ≡ N invariant: totals always equal stage count', async () => {
    const stages = [
      makeStage('analyst-output', 'completed'),
      makeStage('debate-output', 'failed'),
      makeStage('research-synthesis', 'skipped'),
      makeStage('risk-proposal', 'rejected'),
      makeStage('portfolio-proposal', 'completed'),
    ];
    const result = await finalizeDeliberationReport({
      researchGoal: RESEARCH_GOAL,
      proposalId: 'prop-1',
      nowIso: NOW,
      hypothesisResult: hypothesisResult(),
      riskAdvisory: null,
      portfolioResult: null,
      stageResults: stages,
      writer: new DecisionLogWriter(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.totals.total).toBe(stages.length);
    expect(
      result.report.totals.completed +
        result.report.totals.failed +
        result.report.totals.skipped +
        result.report.totals.rejected,
    ).toBe(stages.length);
  });

  it('applies empty-advisory fallbacks when riskAdvisory is null', async () => {
    const result = await finalizeDeliberationReport({
      researchGoal: RESEARCH_GOAL,
      proposalId: 'prop-1',
      nowIso: NOW,
      hypothesisResult: hypothesisResult(),
      riskAdvisory: null,
      portfolioResult: null,
      stageResults: [makeStage('analyst-output', 'completed')],
      writer: new DecisionLogWriter(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.riskAdvisory.advisories).toEqual([]);
    expect(result.report.riskAdvisory.summary).toBe('no risk advisory produced');
  });

  it('applies rejection fallbacks when portfolioResult is null', async () => {
    const result = await finalizeDeliberationReport({
      researchGoal: RESEARCH_GOAL,
      proposalId: 'prop-1',
      nowIso: NOW,
      hypothesisResult: hypothesisResult(),
      riskAdvisory: null,
      portfolioResult: null,
      stageResults: [makeStage('analyst-output', 'completed')],
      writer: new DecisionLogWriter(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.portfolioResult.rejected).toBe(true);
    expect(result.report.portfolioResult.rejectionReasons).toContain('no portfolio advisory produced');
  });

  it('keeps a provided risk advisory and portfolio result verbatim', async () => {
    const riskAdvisory: RiskAdvisorySet = {
      goalId: 'goal-1',
      proposalId: 'prop-1',
      advisories: [
        {
          view: 'aggressive',
          keyConcerns: ['Regime: TREND_UP'],
          recommendedMaxExposure: 0.4,
          hedgeSuggestions: ['vol overlay'],
          monitoringSignals: ['drawdown > 5%'],
        },
      ],
      summary: 'risk overlay applied',
    };
    const portfolioResult: PortfolioAdvisorResult = {
      portfolioResult: {
        positions: [{ alphaId: 'alpha-momentum', targetWeight: 0.3, turnover: 0.1 }],
        grossExposure: 0.3,
        netExposure: 0.3,
        totalTurnover: 0.1,
        riskAdjustments: [],
        drawdownDeRisked: false,
      },
      rejected: false,
      rejectionReasons: [],
    };
    const result = await finalizeDeliberationReport({
      researchGoal: RESEARCH_GOAL,
      proposalId: 'prop-1',
      nowIso: NOW,
      hypothesisResult: hypothesisResult(),
      riskAdvisory,
      portfolioResult,
      stageResults: [makeStage('analyst-output', 'completed')],
      writer: new DecisionLogWriter(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.riskAdvisory.summary).toBe('risk overlay applied');
    expect(result.report.portfolioResult.rejected).toBe(false);
    expect(result.report.portfolioResult.portfolioResult.positions).toHaveLength(1);
  });
});
