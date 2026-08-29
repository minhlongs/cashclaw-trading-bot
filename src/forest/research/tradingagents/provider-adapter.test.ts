// Provider Adapter tests — registry construction, allowlist validation,
// duplicate detection, and the three registry accessors (get /
// getPrimaryForTier / getFallbackForTier). Uses DeterministicFixtureProvider
// so no keys or network are needed.

import { describe, expect, it } from 'vitest';
import { createProviderRegistry, NoProviderAvailableError, ProviderCallFailedError } from './provider-adapter';
import {
  DeterministicFixtureProvider,
  FailingProvider,
  makeFixtureProvider,
} from './test-fixtures';

function configured(provider: { isConfigured: boolean }): boolean {
  return provider.isConfigured;
}

describe('createProviderRegistry — construction', () => {
  it('builds a registry from a single allowlisted provider', () => {
    const result = createProviderRegistry([new DeterministicFixtureProvider()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.registry.providers.size).toBe(1);
  });

  it('rejects an unallowlisted providerId', () => {
    const bad = {
      providerId: 'BogusProvider' as never,
      displayName: 'Bad',
      models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' },
      isConfigured: true,
      async call() {
        throw new Error('never called');
      },
    };
    const result = createProviderRegistry([bad]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('unknown providerId'))).toBe(true);
  });

  it('rejects a duplicate providerId', () => {
    // DeterministicFixtureProvider hardcodes its id to 'Anthropic', so two
    // instances register under the same id and trip the duplicate guard.
    const result = createProviderRegistry([
      new DeterministicFixtureProvider(),
      new DeterministicFixtureProvider(),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes("duplicate providerId 'Anthropic'"))).toBe(true);
  });

  it('rejects when one provider is unallowlisted and another is a duplicate', () => {
    const bad = {
      providerId: 'BogusProvider' as never,
      displayName: 'Bad',
      models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' },
      isConfigured: true,
      async call() {
        throw new Error('never called');
      },
    };
    const result = createProviderRegistry([
      new DeterministicFixtureProvider(),
      bad,
      new DeterministicFixtureProvider(),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('unknown providerId'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('duplicate providerId'))).toBe(true);
  });

  it('accepts an empty provider list', () => {
    const result = createProviderRegistry([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.registry.providers.size).toBe(0);
  });
});

describe('ProviderRegistry.get', () => {
  it('returns the provider for a registered id', () => {
    const result = createProviderRegistry([new DeterministicFixtureProvider()]);
    if (!result.ok) throw new Error('registry');
    expect(result.registry.get('Anthropic')).toBeInstanceOf(DeterministicFixtureProvider);
  });

  it('returns null for an unregistered id', () => {
    const result = createProviderRegistry([new DeterministicFixtureProvider()]);
    if (!result.ok) throw new Error('registry');
    expect(result.registry.get('OpenAI')).toBeNull();
  });

  it('returns null for an unregistered id when the registry is empty', () => {
    const result = createProviderRegistry([]);
    if (!result.ok) throw new Error('registry');
    expect(result.registry.get('Anthropic')).toBeNull();
  });
});

describe('ProviderRegistry.getPrimaryForTier', () => {
  it('returns the first configured provider offering the tier', () => {
    const result = createProviderRegistry([
      new DeterministicFixtureProvider(),
      makeFixtureProvider('OpenAI'),
    ]);
    if (!result.ok) throw new Error('registry');
    const primary = result.registry.getPrimaryForTier('REASONING');
    expect(primary?.providerId).toBe('Anthropic');
  });

  it('skips providers that are not configured', () => {
    const unconfigured = {
      providerId: 'DeepSeek' as const,
      displayName: 'Unc',
      models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' },
      isConfigured: false,
      async call() {
        throw new Error('never called');
      },
    };
    const configuredProvider = makeFixtureProvider('OpenAI');
    const result = createProviderRegistry([unconfigured, configuredProvider]);
    if (!result.ok) throw new Error(`registry: ${result.reasons.join('; ')}`);
    const primary = result.registry.getPrimaryForTier('FAST');
    expect(primary?.providerId).toBe('OpenAI');
  });

  it('returns null when no provider offers the tier', () => {
    const result = createProviderRegistry([]);
    if (!result.ok) throw new Error('registry');
    expect(result.registry.getPrimaryForTier('LOCAL')).toBeNull();
  });
});

describe('ProviderRegistry.getFallbackForTier', () => {
  it('returns the second configured provider offering the tier', () => {
    const result = createProviderRegistry([
      new DeterministicFixtureProvider(),
      makeFixtureProvider('OpenAI'),
    ]);
    if (!result.ok) throw new Error('registry');
    const fallback = result.registry.getFallbackForTier('REASONING');
    expect(fallback?.providerId).toBe('OpenAI');
  });

  it('returns null when only one provider offers the tier', () => {
    const result = createProviderRegistry([new DeterministicFixtureProvider()]);
    if (!result.ok) throw new Error('registry');
    expect(result.registry.getFallbackForTier('FAST')).toBeNull();
  });

  it('returns null when no provider offers the tier', () => {
    const result = createProviderRegistry([]);
    if (!result.ok) throw new Error('registry');
    expect(result.registry.getFallbackForTier('LOCAL')).toBeNull();
  });

  it('skips unconfigured providers when selecting fallback', () => {
    const unconfigured = {
      providerId: 'DeepSeek' as const,
      displayName: 'Unc',
      models: { FAST: 'f', REASONING: 'r', LOCAL: 'l' },
      isConfigured: false,
      async call() {
        throw new Error('never called');
      },
    };
    const result = createProviderRegistry([
      new DeterministicFixtureProvider(),
      unconfigured,
      makeFixtureProvider('OpenAI'),
    ]);
    if (!result.ok) throw new Error(`registry: ${result.reasons.join('; ')}`);
    const fallback = result.registry.getFallbackForTier('REASONING');
    // The unconfigured provider in the middle is skipped, so the second
    // CONFIGURED provider (OpenAI) is the fallback.
    expect(fallback?.providerId).toBe('OpenAI');
  });
});

describe('FailingProvider', () => {
  it('always throws on call', async () => {
    const provider = new FailingProvider();
    await expect(provider.call({ prompt: 'p' })).rejects.toThrow('provider intentionally failed');
  });

  it('is configured and offers all three tiers', () => {
    const provider = new FailingProvider();
    expect(provider.isConfigured).toBe(true);
    expect(Object.keys(provider.models)).toEqual(['FAST', 'REASONING', 'LOCAL']);
  });
});

// `configured` is a helper above — guard against a future refactor that
// drops it leaving a dangling reference.
describe('helpers', () => {
  it('configured reflects isConfigured', () => {
    expect(configured({ isConfigured: true })).toBe(true);
    expect(configured({ isConfigured: false })).toBe(false);
  });
});

describe('error classes (exported contract)', () => {
  it('NoProviderAvailableError carries tier, task, agentRole', () => {
    const err = new NoProviderAvailableError('REASONING', 'debate', 'bull-researcher');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NoProviderAvailableError');
    expect(err.tier).toBe('REASONING');
    expect(err.task).toBe('debate');
    expect(err.agentRole).toBe('bull-researcher');
    expect(err.message).toContain('REASONING');
  });

  it('ProviderCallFailedError carries providerId and originalError', () => {
    const original = new Error('timeout');
    const err = new ProviderCallFailedError('Anthropic', original);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ProviderCallFailedError');
    expect(err.providerId).toBe('Anthropic');
    expect(err.originalError).toBe(original);
    expect(err.message).toContain('timeout');
  });
});