// Debate Orchestrator phase failure branch tests.

import { describe, expect, it } from 'vitest';
import { runDebateOrchestrator, type DebateOrchestratorConfig } from './debate-orchestrator';
import { createModelRouter, type ModelRouter } from './model-router';
import { DeterministicFixtureProvider } from './test-fixtures';
import type { LlmProvider, LlmProviderInput, LlmProviderResult } from './provider-adapter';

const NOW = '2026-08-26T00:00:00.000Z';

function makeConfig(overrides: Partial<DebateOrchestratorConfig> = {}): DebateOrchestratorConfig {
  const routerResult = createModelRouter([new DeterministicFixtureProvider()]);
  if (!routerResult.ok) throw new Error(`router: ${routerResult.reasons.join('; ')}`);
  return { router: routerResult.router, maxDebateRounds: 1, researchGoalId: 'g1', proposalId: 'p1', nowIso: NOW, ...overrides };
}

function routerFrom(provider: LlmProvider): ModelRouter {
  const result = createModelRouter([provider]);
  if (!result.ok) throw new Error(`router: ${result.reasons.join('; ')}`);
  return result.router;
}

const ROLE_JSON: Record<string, string> = {
  analyst: JSON.stringify({ claim: 'ok', evidence: ['e'] }),
  'bull-researcher': JSON.stringify({ thesis: 'Bull', evidence: ['e'], mechanism: 'm', expectedDirection: 'long', horizon: 20, features: ['f'] }),
  'bear-researcher': JSON.stringify({ thesis: 'Bear', evidence: ['e'], mechanism: 'm', expectedDirection: 'short', horizon: 20, features: ['f'] }),
  'research-manager': JSON.stringify({ thesis: 'Synth', strongestEvidence: 'e', strongestCounterEvidence: 'c', unresolvedUncertainty: 'u', falsifiableAssumptions: [{ statement: 's', howToFalsify: 'f' }], proposedExperiments: [{ hypothesisRef: 'h', method: 'm' }] }),
  'risk-advisor': JSON.stringify({ expectedRegime: 'TREND_UP', keyRisks: ['k'], failureConditions: ['f'], maxAcceptableExposure: 0.6, liquidityConcern: 'l', volatilityConcern: 'v', correlationConcern: 'c' }),
  'portfolio-advisor': JSON.stringify({ assets: ['a'], weights: [0.3], hedge: 'h', rebalance: 'r', exposure: 0.5 }),
};

function detectRole(sp: string | undefined): string {
  if (!sp) return 'analyst';
  for (const r of ['bull researcher', 'bear researcher', 'research manager', 'risk advisor', 'portfolio advisor']) {
    if (sp.includes(r)) return r.replace(' ', '-');
  }
  return 'analyst';
}

function makeRoleFailingProvider(failingRoles: readonly string[]): LlmProvider {
  return {
    providerId: 'OpenAI', displayName: 'Role-Failing (TEST)', models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' }, isConfigured: true,
    async call(input: LlmProviderInput): Promise<LlmProviderResult> {
      const role = detectRole(input.systemPrompt);
      if (failingRoles.includes(role)) throw new Error(`${role} intentionally failed`);
      return { text: ROLE_JSON[role], usage: { promptTokens: 10, completionTokens: 5 }, latencyMs: 10 };
    },
  };
}

function makeContaminatingProvider(): LlmProvider {
  return {
    providerId: 'Anthropic', displayName: 'Contaminating (TEST)', models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' }, isConfigured: true,
    async call(input: LlmProviderInput): Promise<LlmProviderResult> {
      if ((input.systemPrompt ?? '').includes('bull researcher')) return { text: '```bash\nrm -rf /\n```', usage: { promptTokens: 1, completionTokens: 1 }, latencyMs: 1 };
      return { text: JSON.stringify({ thesis: 'ok', evidence: ['e'], mechanism: 'm', expectedDirection: 'long', horizon: 20, features: ['f'] }), usage: { promptTokens: 10, completionTokens: 5 }, latencyMs: 10 };
    },
  };
}

function makeEmptyDebateProvider(): LlmProvider {
  return {
    providerId: 'OpenAI', displayName: 'Empty-Debate (TEST)', models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' }, isConfigured: true,
    async call(): Promise<LlmProviderResult> { return { text: '{}', usage: { promptTokens: 1, completionTokens: 1 }, latencyMs: 1 }; },
  };
}

describe('runDebateOrchestrator — phase failures', () => {
  it('continues past analyst failures and surfaces reasons', async () => {
    const router = routerFrom(makeRoleFailingProvider(['analyst']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('aborts when the bull researcher call fails mid-debate', async () => {
    const router = routerFrom(makeRoleFailingProvider(['bull-researcher']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.includes('bull-researcher intentionally failed'))).toBe(true);
  });

  it('aborts when the bear researcher call fails mid-debate', async () => {
    const router = routerFrom(makeRoleFailingProvider(['bear-researcher']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.includes('bear-researcher intentionally failed'))).toBe(true);
  });

  it('returns missing-fields error when debate JSON lacks required fields', async () => {
    const router = routerFrom(makeEmptyDebateProvider());
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.includes('missing required structured fields'))).toBe(true);
  });

  it('aborts on synthesis failure', async () => {
    const router = routerFrom(makeRoleFailingProvider(['research-manager']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.includes('research-manager'))).toBe(true);
  });

  it('continues past risk-advisor failures and still composes the proposal', async () => {
    const router = routerFrom(makeRoleFailingProvider(['risk-advisor']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.decisionProposal.riskFactors.length).toBe(0);
  });

  it('aborts on portfolio proposal failure', async () => {
    const router = routerFrom(makeRoleFailingProvider(['portfolio-advisor']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.includes('portfolio-advisor'))).toBe(true);
  });

  it('rejects when a contaminated prompt trips the security gate', async () => {
    const router = routerFrom(makeContaminatingProvider());
    const result = await runDebateOrchestrator({ ...makeConfig(), router, maxDebateRounds: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.some((r) => r.includes('security gate'))).toBe(true);
  });
});
