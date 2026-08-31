// Demo Config tests — verifies the deterministic demo config builder and its
// fail-closed router path (lines 84-85). Uses vi.mock to force the router
// factory to fail for the throw branch.

import { describe, expect, it, vi } from 'vitest';

// Mock the router factory so buildDemoConfig can be exercised with a failing
// registry alongside the normal path.
const mockCreateModelRouter = vi.hoisted(() => vi.fn());

vi.mock('./model-router', () => ({
  createModelRouter: (...args: unknown[]) => mockCreateModelRouter(...args),
}));

import { buildDemoConfig } from './demo-config';
import { DeterministicFixtureProvider } from './test-fixtures';

describe('buildDemoConfig', () => {
  it('returns a fully-populated RunDeliberationConfig on success', () => {
    const router = { route: vi.fn() };
    mockCreateModelRouter.mockReturnValueOnce({ ok: true, router });
    const config = buildDemoConfig();
    expect(config.researchGoal.id).toBe('goal-demo');
    expect(config.proposalId).toBe('prop-demo');
    expect(config.maxDebateRounds).toBe(1);
    expect(config.dataWindow.barCount).toBe(1000);
    expect(config.timeframe).toBe('1d');
    expect(config.importerVersion).toBe('deliberation-adapter@1');
    expect(config.defaultCostMode).toBe('normal');
    expect(config.composedAlphas.length).toBe(1);
    expect(config.composedAlphas[0].alphaId).toBe('alpha-momentum');
  });

  it('throws when the model router factory fails (fail-closed)', () => {
    mockCreateModelRouter.mockReturnValueOnce({ ok: false, reasons: ['router: bad'] });
    expect(() => buildDemoConfig()).toThrow(/demo router: router: bad/);
  });

  it('passes the DeterministicFixtureProvider through to the router factory', () => {
    const router = { route: vi.fn() };
    mockCreateModelRouter.mockReturnValueOnce({ ok: true, router });
    buildDemoConfig();
    const [providers] = mockCreateModelRouter.mock.calls[0] as [unknown[]];
    expect(providers.length).toBe(1);
    expect(providers[0]).toBeInstanceOf(DeterministicFixtureProvider);
  });
});