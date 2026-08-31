// Decision Proposal Composer tests — covers branch fallbacks for missing
// model provenance and agent role. Pure function, no I/O.

import { describe, expect, it } from 'vitest';
import { composeDecisionProposal } from './decision-proposal-composer';
import type { DebateOrchestratorConfig } from './debate-orchestrator';
import type { ModelProvenanceRecord } from '@/tree/research/tradingagents';

const NOW = '2026-08-26T00:00:00.000Z';

function makeConfig(overrides: Partial<DebateOrchestratorConfig> = {}): DebateOrchestratorConfig {
  return {
    router: {} as any, // not used by composeDecisionProposal
    maxDebateRounds: 1,
    researchGoalId: 'goal-1',
    proposalId: 'prop-1',
    nowIso: NOW,
    ...overrides,
  };
}

function makeProvenance(overrides: Partial<ModelProvenanceRecord> = {}): ModelProvenanceRecord {
  return {
    agentRole: 'bull-researcher',
    task: 'debate',
    provenance: {
      providerId: 'Anthropic',
      modelId: 'claude-opus-5',
      tier: 'REASONING',
    },
    ...overrides,
  };
}

describe('composeDecisionProposal', () => {
  it('uses provided model provenance when available', () => {
    const provenance = [makeProvenance()];
    const result = composeDecisionProposal(
      makeConfig(),
      'bull thesis',
      'bear thesis',
      'synthesis',
      ['risk1', 'risk2'],
      'portfolio proposal',
      provenance,
    );

    expect(result.proposalId).toBe('prop-1');
    expect(result.researchGoalId).toBe('goal-1');
    expect(result.thesis).toBe('bull thesis');
    expect(result.counterThesis).toBe('bear thesis');
    expect(result.riskFactors).toEqual(['risk1', 'risk2']);
    expect(result.modelProvenance.providerId).toBe('Anthropic');
    expect(result.modelProvenance.modelId).toBe('claude-opus-5');
    expect(result.agentProvenance.providerId).toBe('Anthropic');
    expect(result.agentProvenance.modelId).toBe('claude-opus-5');
    expect(result.agentProvenance.agentRole).toBe('bull-researcher');
  });

  it('falls back to Unknown provider/model when modelProvenance is empty', () => {
    const result = composeDecisionProposal(
      makeConfig(),
      'bull thesis',
      'bear thesis',
      'synthesis',
      [],
      'portfolio proposal',
      [], // empty model provenance
    );

    expect(result.modelProvenance.providerId).toBe('Unknown');
    expect(result.modelProvenance.modelId).toBe('Unknown');
    expect(result.modelProvenance.tier).toBe('REASONING');
    expect(result.agentProvenance.providerId).toBe('Unknown');
    expect(result.agentProvenance.modelId).toBe('Unknown');
    expect(result.agentProvenance.agentRole).toBe('bull-researcher');
  });

  it('uses first record for agent provenance', () => {
    const provenance = [
      makeProvenance({ provenance: { providerId: 'OpenAI', modelId: 'gpt-4o', tier: 'REASONING' } }),
      makeProvenance({ provenance: { providerId: 'Anthropic', modelId: 'claude-3', tier: 'FAST' } }),
    ];
    const result = composeDecisionProposal(
      makeConfig(),
      'bull thesis',
      'bear thesis',
      'synthesis',
      [],
      'portfolio proposal',
      provenance,
    );

    expect(result.agentProvenance.providerId).toBe('OpenAI');
    expect(result.agentProvenance.modelId).toBe('gpt-4o');
  });

  it('includes fixed evidence sources', () => {
    const result = composeDecisionProposal(
      makeConfig(),
      'bull',
      'bear',
      'synthesis',
      [],
      'portfolio',
      [makeProvenance()],
    );

    expect(result.evidence).toEqual([
      { claim: 'Bull thesis', source: 'bull-researcher' },
      { claim: 'Bear thesis', source: 'bear-researcher' },
      { claim: 'Research synthesis', source: 'research-manager' },
    ]);
  });

  it('includes fixed assumptions, invalidation conditions, and catalysts', () => {
    const result = composeDecisionProposal(
      makeConfig(),
      'bull',
      'bear',
      'synthesis',
      [],
      'portfolio',
      [makeProvenance()],
    );

    expect(result.assumptions).toEqual(['Market regime persistence', 'Liquidity availability', 'Correlation stability']);
    expect(result.invalidationConditions).toEqual(['Regime shift', 'Liquidity crisis', 'Correlation breakdown']);
    expect(result.catalyst).toEqual(['Earnings', 'Macro event', 'Technical breakout']);
  });

  it('sets fixed horizon, confidence, and direction defaults', () => {
    const result = composeDecisionProposal(
      makeConfig(),
      'bull',
      'bear',
      'synthesis',
      [],
      'portfolio',
      [makeProvenance()],
    );

    expect(result.horizon).toBe(20);
    expect(result.confidence).toBe(0.65);
    expect(result.proposedDirection).toBe('long');
    expect(result.proposedPosition).toBe(0.1);
    expect(result.proposedEntry).toBe('market');
    expect(result.proposedExit).toBe('target or stop');
    expect(result.proposedStop).toBe('2% below entry');
  });

  it('includes data provenance with ohlcv and regime', () => {
    const result = composeDecisionProposal(
      makeConfig({ nowIso: NOW }),
      'bull',
      'bear',
      'synthesis',
      [],
      'portfolio',
      [makeProvenance()],
    );

    expect(result.dataProvenance).toEqual([
      { dataset: 'ohlcv', provider: 'binance', timestamp: NOW },
      { dataset: 'regime', provider: 'internal', timestamp: NOW },
    ]);
  });
});