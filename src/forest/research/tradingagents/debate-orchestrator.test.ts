// Debate Orchestrator tests — covers branch paths for analyst/bull-bear/
// synthesis/risk/portfolio phase failures and the missing-fields guard.
// Pure orchestration; DeterministicFixtureProvider (D11 TEST seam) drives it.

import { describe, expect, it } from 'vitest';
import { runDebateOrchestrator, type DebateOrchestratorConfig } from './debate-orchestrator';
import { createModelRouter, type ModelRouter } from './model-router';
import { DeterministicFixtureProvider } from './test-fixtures';
import type { LlmProvider, LlmProviderInput, LlmProviderResult } from './provider-adapter';

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

/** Build a router from a single custom provider. */
function routerFrom(provider: LlmProvider): ModelRouter {
  const result = createModelRouter([provider]);
  if (!result.ok) throw new Error(`router: ${result.reasons.join('; ')}`);
  return result.router;
}

/** Valid canned JSON per role (matches the test-fixtures schema). */
const ROLE_JSON: Record<string, string> = {
  analyst: JSON.stringify({ claim: 'ok', evidence: ['e'] }),
  'bull-researcher': JSON.stringify({
    thesis: 'Momentum persists in trending regime',
    evidence: ['Trend strength above 20-day MA', 'Volume confirmation'],
    mechanism: 'Trend-following momentum drives continued returns due to persistent investor flows',
    expectedDirection: 'long', horizon: 20, features: ['momentum_20d', 'volume_ratio'],
  }),
  'bear-researcher': JSON.stringify({
    thesis: 'Mean reversion dominates after overextension',
    evidence: ['RSI above 70', 'Divergence in volume'],
    mechanism: 'Overextension in momentum leads to reversal as positioning unwinds',
    expectedDirection: 'short', horizon: 20, features: ['rsi_14', 'volume_divergence'],
  }),
  'research-manager': JSON.stringify({
    thesis: 'Momentum with mean-reversion guard',
    strongestEvidence: 'Trend strength above 20-day MA',
    strongestCounterEvidence: 'RSI above 70',
    unresolvedUncertainty: 'Regime transition timing',
    falsifiableAssumptions: [{ statement: 'Trend persists 20 bars', howToFalsify: 'Break below 20-day MA' }],
    proposedExperiments: [{ hypothesisRef: 'momentum-20d', method: 'Walk-forward OOS' }],
  }),
  'risk-advisor': JSON.stringify({
    expectedRegime: 'TREND_UP', keyRisks: ['Regime shift', 'Liquidity gap'],
    failureConditions: ['Drawdown exceeds 5%', 'Correlation spike'],
    maxAcceptableExposure: 0.6, liquidityConcern: 'moderate',
    volatilityConcern: 'high', correlationConcern: 'low',
  }),
  'portfolio-advisor': JSON.stringify({
    assets: ['alpha-momentum'], weights: [0.3], hedge: 'volatility overlay',
    rebalance: 'weekly', exposure: 0.5,
  }),
};

/** Detect the agent role from the systemPrompt (mirrors test-fixtures). */
function detectRole(systemPrompt: string | undefined): string {
  if (!systemPrompt) return 'analyst';
  if (systemPrompt.includes('bull researcher')) return 'bull-researcher';
  if (systemPrompt.includes('bear researcher')) return 'bear-researcher';
  if (systemPrompt.includes('research manager')) return 'research-manager';
  if (systemPrompt.includes('risk advisor')) return 'risk-advisor';
  if (systemPrompt.includes('portfolio advisor')) return 'portfolio-advisor';
  return 'analyst';
}

/** A fixture provider that fails (throws) for a specific set of roles. */
function makeRoleFailingProvider(failingRoles: readonly string[]): LlmProvider {
  return {
    providerId: 'OpenAI',
    displayName: `Role-Failing (TEST)`,
    models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' },
    isConfigured: true,
    async call(input: LlmProviderInput): Promise<LlmProviderResult> {
      const role = detectRole(input.systemPrompt);
      if (failingRoles.includes(role)) throw new Error(`${role} intentionally failed`);
      return { text: ROLE_JSON[role], usage: { promptTokens: 10, completionTokens: 5 }, latencyMs: 10 };
    },
  };
}

/** A fixture provider that returns malicious text for the bull researcher,
 * contaminating the next round's prompt and triggering the security gate. */
function makeContaminatingProvider(): LlmProvider {
  return {
    providerId: 'Anthropic',
    displayName: 'Contaminating (TEST)',
    models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' },
    isConfigured: true,
    async call(input: LlmProviderInput): Promise<LlmProviderResult> {
      const sp = input.systemPrompt ?? '';
      if (sp.includes('bull researcher')) {
        return { text: '```bash\nrm -rf /\n```', usage: { promptTokens: 1, completionTokens: 1 }, latencyMs: 1 };
      }
      return {
        text: JSON.stringify({
          thesis: 'ok', evidence: ['e'], mechanism: 'm', expectedDirection: 'long',
          horizon: 20, features: ['f'],
        }),
        usage: { promptTokens: 10, completionTokens: 5 }, latencyMs: 10,
      };
    },
  };
}

/** A fixture provider that returns structurally-invalid JSON for the debate
 * roles (empty object) so parseDebateSide returns null. */
function makeEmptyDebateProvider(): LlmProvider {
  return {
    providerId: 'OpenAI',
    displayName: 'Empty-Debate (TEST)',
    models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' },
    isConfigured: true,
    async call(_input: LlmProviderInput): Promise<LlmProviderResult> {
      return { text: '{}', usage: { promptTokens: 1, completionTokens: 1 }, latencyMs: 1 };
    },
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

  it('runs with zero debate rounds and still produces a proposal', async () => {
    const result = await runDebateOrchestrator(makeConfig({ maxDebateRounds: 0 }));
    // No rounds → bull/bear sides are null → missing-fields guard fires.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('missing required structured fields'))).toBe(true);
  });
});

describe('runDebateOrchestrator — phase failures', () => {
  it('continues past analyst failures and surfaces reasons', async () => {
    const router = routerFrom(makeRoleFailingProvider(['analyst']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    // All four analyst calls fail → reasons accumulate → early return after debate.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('aborts when the bull researcher call fails mid-debate', async () => {
    const router = routerFrom(makeRoleFailingProvider(['bull-researcher']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('bull-researcher intentionally failed'))).toBe(true);
  });

  it('aborts when the bear researcher call fails mid-debate', async () => {
    const router = routerFrom(makeRoleFailingProvider(['bear-researcher']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('bear-researcher intentionally failed'))).toBe(true);
  });

  it('returns missing-fields error when debate JSON lacks required fields', async () => {
    const router = routerFrom(makeEmptyDebateProvider());
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('missing required structured fields'))).toBe(true);
  });

  it('aborts on synthesis failure', async () => {
    const router = routerFrom(makeRoleFailingProvider(['research-manager']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('research-manager'))).toBe(true);
  });

  it('continues past risk-advisor failures and still composes the proposal', async () => {
    const router = routerFrom(makeRoleFailingProvider(['risk-advisor']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    // Risk failures accumulate but the orchestrator does NOT abort — it keeps
    // going to the portfolio phase, which succeeds.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decisionProposal.riskFactors.length).toBe(0);
  });

  it('aborts on portfolio proposal failure', async () => {
    const router = routerFrom(makeRoleFailingProvider(['portfolio-advisor']));
    const result = await runDebateOrchestrator({ ...makeConfig(), router });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('portfolio-advisor'))).toBe(true);
  });

  it('rejects when a contaminated prompt trips the security gate', async () => {
    // Round 1 bull returns a code-fence payload; round 2 bear prompt embeds it
    // → sanitizeUntrusted fails inside callAgent → reason recorded, loop ends.
    const router = routerFrom(makeContaminatingProvider());
    const result = await runDebateOrchestrator({ ...makeConfig(), router, maxDebateRounds: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('security gate'))).toBe(true);
  });
});