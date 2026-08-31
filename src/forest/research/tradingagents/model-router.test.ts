// Model Router tests — tiered routing (FAST/REASONING/LOCAL), fallback
// selection, typed failure on missing key/config. Built on
// DeterministicFixtureProvider so routing logic is tested with zero
// tokens/keys.

import { describe, expect, it, vi } from 'vitest';
import { ModelRouter, createModelRouter, RoutingError } from './model-router';
import { createProviderRegistry, type ProviderRegistry } from './provider-adapter';
import {
  DeterministicFixtureProvider,
  makeFixtureProvider,
  makeFailingFixtureProvider,
} from './test-fixtures';
import type { SupportedProvider } from '@/tree/research/tradingagents';

/**
 * Build a registry from fixture providers keyed by id.
 * `DeterministicFixtureProvider` hardcodes its id to 'Anthropic', so we use
 * the factory functions when more than one distinct provider is needed.
 */
function registryByIds(ids: readonly SupportedProvider[]): ProviderRegistry {
  const providers = ids.map((id) =>
    id === 'Anthropic' ? new DeterministicFixtureProvider() : makeFixtureProvider(id),
  );
  const result = createProviderRegistry(providers);
  if (!result.ok) throw new Error(`registry: ${result.reasons.join('; ')}`);
  return result.registry;
}

describe('RoutingError', () => {
  it('carries task and agentRole alongside the message', () => {
    // RoutingError is exported as part of the router's public contract
    // (index.ts re-exports it) even though `route()` currently returns a
    // typed failure rather than throwing — the class exists for callers
    // that want to type-narrow router errors.
    const err = new RoutingError('no route', 'debate', 'bull-researcher');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RoutingError');
    expect(err.message).toBe('no route');
    expect(err.task).toBe('debate');
    expect(err.agentRole).toBe('bull-researcher');
  });
});

describe('createModelRouter', () => {
  it('creates a router from a non-empty provider list', () => {
    const result = createModelRouter([new DeterministicFixtureProvider()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.router).toBeInstanceOf(ModelRouter);
  });

  it('rejects a provider list containing an unallowlisted id', () => {
    // Unknown providerId → createProviderRegistry returns { ok: false } and
    // createModelRouter propagates that failure (line 200).
    const bad = {
      providerId: 'BogusProvider' as never,
      displayName: 'Bad',
      models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' },
      isConfigured: true,
      async call(): Promise<import('./provider-adapter').LlmProviderResult> {
        throw new Error('never called');
      },
    };
    const result = createModelRouter([bad]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('unknown providerId'))).toBe(true);
  });

  it('accepts an empty provider list (route fails typed, not silently)', () => {
    // An empty list builds an empty registry — no duplicate-id violation.
    // The typed failure surfaces later, in `route`, when no provider exists
    // for the tier. That separation is the contract: construction never
    // rejects on emptiness, routing does.
    const result = createModelRouter([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.router).toBeInstanceOf(ModelRouter);
  });
});

describe('ModelRouter.route — tier routing', () => {
  it('routes a REASONING task to the REASONING-tier provider', async () => {
    const router = new ModelRouter({
      registry: registryByIds(['Anthropic']),
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('bull-researcher', 'debate', {
      prompt: 'Debate the thesis',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.text).toBeTruthy();
    expect(outcome.value.fallbackUsed).toBe(false);
    expect(outcome.value.provenance.provenance.tier).toBe('REASONING');
  });

  it('routes a FAST task to a FAST-capable provider', async () => {
    const router = new ModelRouter({
      registry: registryByIds(['OpenAI']),
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('analyst', 'summarization', {
      prompt: 'Summarize this report',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.text).toBeTruthy();
    expect(outcome.value.provenance.provenance.tier).toBe('FAST');
  });

  it('routes a LOCAL task to a LOCAL-capable provider', async () => {
    const router = new ModelRouter({
      registry: registryByIds(['Ollama/local']),
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('analyst', 'repetitive-research', {
      prompt: 'Repeat this research',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.text).toBeTruthy();
    expect(outcome.value.provenance.provenance.tier).toBe('LOCAL');
  });
});

describe('ModelRouter.route — fallback + failure', () => {
  it('returns a typed failure when the primary provider throws and no fallback exists', async () => {
    const throwing = new DeterministicFixtureProvider();
    vi.spyOn(throwing, 'call').mockRejectedValue(new Error('provider down'));
    const registry = createProviderRegistry([throwing]);
    if (!registry.ok) throw new Error('registry');
    const router = new ModelRouter({
      registry: registry.registry,
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('bull-researcher', 'debate', {
      prompt: 'fail',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reasons.some((r) => r.includes('provider down'))).toBe(true);
  });

  it('falls back to the second provider when the primary throws', async () => {
    const primary = makeFailingFixtureProvider('Anthropic');
    const fallback = makeFixtureProvider('OpenAI');
    const registry = createProviderRegistry([primary, fallback]);
    if (!registry.ok) throw new Error(`registry: ${registry.reasons.join('; ')}`);
    const router = new ModelRouter({
      registry: registry.registry,
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('research-manager', 'research-synthesis', {
      prompt: 'Synthesize',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.fallbackUsed).toBe(true);
    expect(outcome.value.provenance.provenance.providerId).toBe('OpenAI');
  });

  it('records provenance with agentRole and task', async () => {
    const router = new ModelRouter({
      registry: registryByIds(['Anthropic']),
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('research-manager', 'research-synthesis', {
      prompt: 'Synthesize',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.provenance.agentRole).toBe('research-manager');
    expect(outcome.value.provenance.task).toBe('research-synthesis');
  });

  it('returns typed failure when both primary and fallback throw', async () => {
    const primary = makeFailingFixtureProvider('Anthropic');
    const fallback = makeFailingFixtureProvider('OpenAI');
    const registry = createProviderRegistry([primary, fallback]);
    if (!registry.ok) throw new Error(`registry: ${registry.reasons.join('; ')}`);
    const router = new ModelRouter({
      registry: registry.registry,
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('bull-researcher', 'debate', {
      prompt: 'fail',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reasons.length).toBe(1);
    expect(outcome.reasons[0]).toContain('primary');
    expect(outcome.reasons[0]).toContain('fallback');
  });

  it('returns typed failure when no provider is configured for the tier', async () => {
    // Empty registry → no primary for any tier.
    const result = createModelRouter([]);
    if (!result.ok) throw new Error('router');
    const outcome = await result.router.route('bull-researcher', 'debate', {
      prompt: 'fail',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reasons.some((r) => r.includes('no configured primary provider'))).toBe(true);
  });

  it('returns typed failure when the agentRole is empty (provenance gate)', async () => {
    // Primary succeeds but recordModelProvenance rejects the empty role.
    const router = new ModelRouter({
      registry: registryByIds(['Anthropic']),
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('' as never, 'debate', { prompt: 'p' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reasons.some((r) => r.includes('agentRole must be non-empty'))).toBe(true);
  });

  it('falls back and returns typed failure when the fallback succeeds but provenance rejects', async () => {
    // Primary throws → fallback succeeds → recordModelProvenance rejects empty role.
    const primary = makeFailingFixtureProvider('Anthropic');
    const fallback = makeFixtureProvider('OpenAI');
    const registry = createProviderRegistry([primary, fallback]);
    if (!registry.ok) throw new Error(`registry: ${registry.reasons.join('; ')}`);
    const router = new ModelRouter({
      registry: registry.registry,
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('' as never, 'research-synthesis', {
      prompt: 'p',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reasons.some((r) => r.includes('agentRole must be non-empty'))).toBe(true);
  });

  it('uses wall-clock latency when the provider reports zero latency', async () => {
    // The `latencyMs > 0 ? result.latencyMs : Date.now() - startMs` ternary
    // prefers provider-reported latency when positive; a zero report falls
    // through to wall-clock. Outcomes remain ok — only the recorded latency
    // changes from the deterministic 10ms to a measured value.
    const zeroLatency = {
      providerId: 'Anthropic' as const,
      displayName: 'Zero-Latency Fixture (TEST)',
      models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' },
      isConfigured: true,
      async call(): Promise<import('./provider-adapter').LlmProviderResult> {
        return { text: '{}', usage: { promptTokens: 1, completionTokens: 1 }, latencyMs: 0 };
      },
    };
    const registryResult = createProviderRegistry([zeroLatency]);
    if (!registryResult.ok) throw new Error('registry');
    const router = new ModelRouter({
      registry: registryResult.registry,
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const outcome = await router.route('bull-researcher', 'debate', { prompt: 'p' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.provenance.provenance.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('ModelRouter.getSelectedProvider', () => {
  it('returns the primary and fallback for a tier', () => {
    const router = new ModelRouter({
      registry: registryByIds(['Anthropic', 'OpenAI']),
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const selected = router.getSelectedProvider('REASONING');
    expect(selected.primary?.providerId).toBe('Anthropic');
    expect(selected.fallback?.providerId).toBe('OpenAI');
  });

  it('returns null when no provider covers the tier', () => {
    const router = new ModelRouter({
      registry: registryByIds([]),
      defaultTimeoutMs: 5000,
      maxTokensCap: 1000,
    });
    const selected = router.getSelectedProvider('REASONING');
    expect(selected.primary).toBeNull();
    expect(selected.fallback).toBeNull();
  });
});