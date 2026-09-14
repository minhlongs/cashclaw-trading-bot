// Debate Orchestrator happy path & unit tests.

import { describe, expect, it } from 'vitest';
import {
  runDebateOrchestrator,
  evaluateTradingDebate,
  formatDebatePrompt,
  type DebateOrchestratorConfig,
} from './debate-orchestrator';
import { createModelRouter } from './model-router';
import { DeterministicFixtureProvider } from './test-fixtures';

const NOW = '2026-08-26T00:00:00.000Z';

function makeConfig(overrides: Partial<DebateOrchestratorConfig> = {}): DebateOrchestratorConfig {
  const routerResult = createModelRouter([new DeterministicFixtureProvider()]);
  if (!routerResult.ok) throw new Error(`router: ${routerResult.reasons.join('; ')}`);
  return {
    router: routerResult.router,
    maxDebateRounds: 1,
    researchGoalId: 'goal-1',
    proposalId: 'prop-1',
    nowIso: NOW,
    ...overrides,
  };
}

describe('runDebateOrchestrator — happy path', () => {
  it('runs all six phases and returns a valid OrchestratorResult', async () => {
    const result = await runDebateOrchestrator(makeConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bull.role).toBe('bull-researcher');
    expect(result.value.bear.role).toBe('bear-researcher');
    expect(result.value.bull.thesis.length).toBeGreaterThan(0);
    expect(result.value.bear.thesis.length).toBeGreaterThan(0);
    expect(result.value.modelProvenance.length).toBeGreaterThan(0);
    expect(result.value.decisionProposal.proposalId).toBe('prop-1');
    expect(result.value.debateState.status).toBe('complete');
  });

  it('runs with zero debate rounds and triggers missing-fields guard', async () => {
    const result = await runDebateOrchestrator(makeConfig({ maxDebateRounds: 0 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('missing required structured fields'))).toBe(true);
  });

  it('verifies evaluateTradingDebate alias matches runDebateOrchestrator', () => {
    expect(evaluateTradingDebate).toBe(runDebateOrchestrator);
  });

  it('formats bull and bear debate prompts correctly', () => {
    const bullPrompt = formatDebatePrompt('bull', 1, 'prior-bear-point');
    expect(bullPrompt).toContain('Round 1: Argue the BULL case');
    expect(bullPrompt).toContain('Previous bear: prior-bear-point');

    const bearPrompt = formatDebatePrompt('bear', 2, '');
    expect(bearPrompt).toContain('Round 2: Argue the BEAR case');
    expect(bearPrompt).toContain('Previous bull: none');
  });
});
