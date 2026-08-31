// Debate-to-Hypothesis tests — covers orchestrator failure, extraction failure,
// lineage build catch, compile failure/continue paths.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { debateToHypothesis } from './debate-to-hypothesis';
import type { ModelRouter } from './model-router';
import type { DebateOrchestratorConfig } from './debate-orchestrator';
import type { DecisionProposal } from '@/tree/research/tradingagents/decision-contract';
import type { DebateState } from '@/tree/research/tradingagents/debate-state';
import type { ModelProvenanceRecord, ToolProvenance } from '@/tree/research/tradingagents';
import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';
import type { ExperimentSpec } from '@/tree/research/alpha/experiment-spec';
import type { ResearchLineage } from '@/tree/research/evidence/lineage';

function makeMockRouter(): ModelRouter {
  return {
    route: vi.fn().mockResolvedValue({ ok: false, reasons: ['not used in this test'] }),
    // The debate-to-hypothesis imports runDebateOrchestrator dynamically,
    // so we need to mock at the module level
  } as any;
}

function makeConfig(overrides: Partial<{
  orchestratorConfig: Partial<DebateOrchestratorConfig>;
  router: ModelRouter;
  dataWindow: any;
  universe: any;
  timeframe: string;
  nowIso: string;
  importerVersion: string;
  defaultCostMode: any;
}> = {}): Parameters<typeof debateToHypothesis>[0] {
  return {
    orchestratorConfig: {
      router: overrides.router || makeMockRouter(),
      maxDebateRounds: 2,
      researchGoalId: 'goal-1',
      proposalId: 'prop-1',
      nowIso: '2026-08-26T00:00:00.000Z',
      ...overrides.orchestratorConfig,
    },
    router: overrides.router || makeMockRouter(),
    dataWindow: overrides.dataWindow || { start: '2024-01-01', end: '2024-12-31' },
    universe: overrides.universe || { id: 'test-universe', symbols: ['BTC-USD'], weighting: 'equal' as const, rebalanceRule: 'daily' as const },
    timeframe: overrides.timeframe || '1d',
    nowIso: overrides.nowIso || '2026-08-26T00:00:00.000Z',
    importerVersion: overrides.importerVersion || 'test-1.0',
    defaultCostMode: overrides.defaultCostMode || 'EXTREME',
  };
}

describe('debateToHypothesis', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns orchestrator failure when orchestrator fails', async () => {
    // Mock the debate-orchestrator module
    vi.doMock('./debate-orchestrator', () => ({
      runDebateOrchestrator: vi.fn().mockResolvedValue({
        ok: false,
        reasons: ['orchestrator failed: provider error'],
      }),
    }));

    const { debateToHypothesis: freshDebateToHypothesis } = await import('./debate-to-hypothesis');
    const result = await freshDebateToHypothesis(makeConfig());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0]).toContain('orchestrator failed');
    }
  });

  it('returns extraction failure when hypothesis extraction fails', async () => {
    vi.doMock('./debate-orchestrator', () => ({
      runDebateOrchestrator: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          decisionProposal: {} as DecisionProposal,
          debateState: {} as DebateState,
          bull: { role: 'bull-researcher', thesis: 'bull thesis', mechanism: 'mech', evidence: ['e1'], expectedDirection: 'long' as const, horizon: 10, features: ['f1'] },
          bear: { role: 'bear-researcher', thesis: 'bear thesis', mechanism: 'mech', evidence: ['e2'], expectedDirection: 'short' as const, horizon: 10, features: ['f2'] },
          modelProvenance: [] as ModelProvenanceRecord[],
          toolProvenance: [] as ToolProvenance[],
        },
      }),
    }));

    // Also mock hypothesis-extraction to fail
    vi.doMock('@/tree/research/tradingagents/hypothesis-extraction', () => ({
      extractHypotheses: vi.fn().mockReturnValue({
        ok: false,
        reasons: ['extraction failed: invalid mechanism'],
      }),
    }));

    const { debateToHypothesis: freshDebateToHypothesis } = await import('./debate-to-hypothesis');
    const result = await freshDebateToHypothesis(makeConfig());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0]).toContain('extraction failed');
    }
  });

  it('catches lineage build failure and returns typed error', async () => {
    vi.doMock('./debate-orchestrator', () => ({
      runDebateOrchestrator: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          decisionProposal: {} as DecisionProposal,
          debateState: {} as DebateState,
          bull: { role: 'bull-researcher', thesis: 'bull thesis', mechanism: 'mech', evidence: ['e1'], expectedDirection: 'long' as const, horizon: 10, features: ['f1'] },
          bear: { role: 'bear-researcher', thesis: 'bear thesis', mechanism: 'mech', evidence: ['e2'], expectedDirection: 'short' as const, horizon: 10, features: ['f2'] },
          modelProvenance: [] as ModelProvenanceRecord[],
          toolProvenance: [] as ToolProvenance[],
        },
      }),
    }));

    vi.doMock('@/tree/research/tradingagents/hypothesis-extraction', () => ({
      extractHypotheses: vi.fn().mockReturnValue({
        ok: true,
        value: {
          hypothesisA: {} as ResearchHypothesis,
          hypothesisB: {} as ResearchHypothesis,
        },
      }),
    }));

    vi.doMock('@/tree/research/evidence/lineage', () => ({
      buildLineage: vi.fn().mockImplementation(() => {
        throw new Error('lineage cycle detected');
      }),
    }));

    const { debateToHypothesis: freshDebateToHypothesis } = await import('./debate-to-hypothesis');
    const result = await freshDebateToHypothesis(makeConfig());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0]).toContain('lineage build failed');
      expect(result.reasons[0]).toContain('lineage cycle detected');
    }
  });

  it('catches non-Error throw in lineage build (covers catch branch)', async () => {
    vi.doMock('./debate-orchestrator', () => ({
      runDebateOrchestrator: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          decisionProposal: {} as DecisionProposal,
          debateState: {} as DebateState,
          bull: { role: 'bull-researcher', thesis: 'bull thesis', mechanism: 'mech', evidence: ['e1'], expectedDirection: 'long' as const, horizon: 10, features: ['f1'] },
          bear: { role: 'bear-researcher', thesis: 'bear thesis', mechanism: 'mech', evidence: ['e2'], expectedDirection: 'short' as const, horizon: 10, features: ['f2'] },
          modelProvenance: [] as ModelProvenanceRecord[],
          toolProvenance: [] as ToolProvenance[],
        },
      }),
    }));

    vi.doMock('@/tree/research/tradingagents/hypothesis-extraction', () => ({
      extractHypotheses: vi.fn().mockReturnValue({
        ok: true,
        value: {
          hypothesisA: {} as ResearchHypothesis,
          hypothesisB: {} as ResearchHypothesis,
        },
      }),
    }));

    vi.doMock('@/tree/research/evidence/lineage', () => ({
      buildLineage: vi.fn().mockImplementation(() => {
        throw 'string throw'; // non-Error throw
      }),
    }));

    const { debateToHypothesis: freshDebateToHypothesis } = await import('./debate-to-hypothesis');
    const result = await freshDebateToHypothesis(makeConfig());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0]).toContain('lineage build failed');
      expect(result.reasons[0]).toContain('string throw');
    }
  });

  it('continues compiling other hypotheses when one fails', async () => {
    vi.doMock('./debate-orchestrator', () => ({
      runDebateOrchestrator: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          decisionProposal: {} as DecisionProposal,
          debateState: {} as DebateState,
          bull: { role: 'bull-researcher', thesis: 'bull thesis', mechanism: 'mech', evidence: ['e1'], expectedDirection: 'long' as const, horizon: 10, features: ['f1'] },
          bear: { role: 'bear-researcher', thesis: 'bear thesis', mechanism: 'mech', evidence: ['e2'], expectedDirection: 'short' as const, horizon: 10, features: ['f2'] },
          modelProvenance: [] as ModelProvenanceRecord[],
          toolProvenance: [] as ToolProvenance[],
        },
      }),
    }));

    vi.doMock('@/tree/research/tradingagents/hypothesis-extraction', () => ({
      extractHypotheses: vi.fn().mockReturnValue({
        ok: true,
        value: {
          hypothesisA: { id: 'hyp-A' } as ResearchHypothesis,
          hypothesisB: { id: 'hyp-B' } as ResearchHypothesis,
        },
      }),
    }));

    vi.doMock('@/tree/research/evidence/lineage', () => ({
      buildLineage: vi.fn().mockReturnValue({} as ResearchLineage),
    }));

    let compileCallCount = 0;
    vi.doMock('@/tree/research/alpha/compiler', () => ({
      compile: vi.fn().mockImplementation(async (h: any) => {
        compileCallCount++;
        if (h.id === 'hyp-A') {
          return { ok: false, reasons: ['compile failed: missing data'] };
        }
        return { ok: true, value: { id: 'spec-B' } as unknown as ExperimentSpec };
      }),
    }));

    const { debateToHypothesis: freshDebateToHypothesis } = await import('./debate-to-hypothesis');
    const result = await freshDebateToHypothesis(makeConfig());
    // Both compile attempts happen, but first fails → reasons collected → overall failure
    expect(compileCallCount).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0]).toContain('compile(hyp-A): compile failed');
    }
  });

  it('returns success with all components when everything passes', async () => {
    vi.doMock('./debate-orchestrator', () => ({
      runDebateOrchestrator: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          decisionProposal: { thesis: 'test' } as DecisionProposal,
          debateState: { researchGoalId: 'goal-1' } as DebateState,
          bull: { role: 'bull-researcher', thesis: 'bull thesis', mechanism: 'mech', evidence: ['e1'], expectedDirection: 'long' as const, horizon: 10, features: ['f1'] },
          bear: { role: 'bear-researcher', thesis: 'bear thesis', mechanism: 'mech', evidence: ['e2'], expectedDirection: 'short' as const, horizon: 10, features: ['f2'] },
          modelProvenance: [{ agentRole: 'analyst', task: 'data-extraction', provenance: { providerId: 'Test', modelId: 'test', tier: 'FAST', promptTokens: 10, completionTokens: 5, latencyMs: 1 } }] as ModelProvenanceRecord[],
          toolProvenance: [] as ToolProvenance[],
        },
      }),
    }));

    vi.doMock('@/tree/research/tradingagents/hypothesis-extraction', () => ({
      extractHypotheses: vi.fn().mockReturnValue({
        ok: true,
        value: {
          hypothesisA: { id: 'hyp-A', mechanism: 'test', direction: 'long', horizon: 10, features: [], universe: { symbols: ['BTC-USD'] }, costMode: 'EXTREME', createdAt: '2026-08-26T00:00:00.000Z' } as unknown as ResearchHypothesis,
          hypothesisB: { id: 'hyp-B', mechanism: 'test', direction: 'short', horizon: 10, features: [], universe: { symbols: ['BTC-USD'] }, costMode: 'EXTREME', createdAt: '2026-08-26T00:00:00.000Z' } as unknown as ResearchHypothesis,
        },
      }),
    }));

    vi.doMock('@/tree/research/evidence/lineage', () => ({
      buildLineage: vi.fn().mockReturnValue({ nodes: [], edges: [] } as unknown as ResearchLineage),
    }));

    vi.doMock('@/tree/research/alpha/compiler', () => ({
      compile: vi.fn().mockResolvedValue({ ok: true, value: { id: 'spec-1' } as unknown as ExperimentSpec }),
    }));

    const { debateToHypothesis: freshDebateToHypothesis } = await import('./debate-to-hypothesis');
    const result = await freshDebateToHypothesis(makeConfig());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hypotheses).toHaveLength(2);
      expect(result.value.lineage).toBeDefined();
      expect(result.value.experimentSpecs).toHaveLength(2);
      expect(result.value.proposalId).toBe('prop-1');
      expect(result.value.researchGoalId).toBe('goal-1');
      expect(result.value.decisionProposal).toBeDefined();
      expect(result.value.debateState).toBeDefined();
      expect(result.value.modelProvenance).toBeDefined();
      expect(result.value.toolProvenance).toBeDefined();
    }
  });

  it('passes correct config to orchestrator including router', async () => {
    const mockOrchestrator = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        decisionProposal: {} as DecisionProposal,
        debateState: {} as DebateState,
        bull: { role: 'bull-researcher', thesis: 'bull', mechanism: 'mech', evidence: ['e'], expectedDirection: 'long' as const, horizon: 10, features: ['f'] },
        bear: { role: 'bear-researcher', thesis: 'bear', mechanism: 'mech', evidence: ['e'], expectedDirection: 'short' as const, horizon: 10, features: ['f'] },
        modelProvenance: [] as ModelProvenanceRecord[],
        toolProvenance: [] as ToolProvenance[],
      },
    });

    vi.doMock('./debate-orchestrator', () => ({
      runDebateOrchestrator: mockOrchestrator,
    }));

    vi.doMock('@/tree/research/tradingagents/hypothesis-extraction', () => ({
      extractHypotheses: vi.fn().mockReturnValue({
        ok: true,
        value: {
          hypothesisA: {} as ResearchHypothesis,
          hypothesisB: {} as ResearchHypothesis,
        },
      }),
    }));

    vi.doMock('@/tree/research/evidence/lineage', () => ({
      buildLineage: vi.fn().mockReturnValue({} as ResearchLineage),
    }));

    vi.doMock('@/tree/research/alpha/compiler', () => ({
      compile: vi.fn().mockResolvedValue({ ok: true, value: {} as ExperimentSpec }),
    }));

    const mockRouter = makeMockRouter();
    const { debateToHypothesis: freshDebateToHypothesis } = await import('./debate-to-hypothesis');
    await freshDebateToHypothesis(makeConfig({ router: mockRouter }));

    expect(mockOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        researchGoalId: 'goal-1',
        proposalId: 'prop-1',
        maxDebateRounds: 2,
        nowIso: '2026-08-26T00:00:00.000Z',
        router: mockRouter,
      })
    );
  });

  it('passes correct extraction config with all fields', async () => {
    vi.doMock('./debate-orchestrator', () => ({
      runDebateOrchestrator: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          decisionProposal: {} as DecisionProposal,
          debateState: {} as DebateState,
          bull: { role: 'bull-researcher', thesis: 'bull', mechanism: 'mech', evidence: ['e'], expectedDirection: 'long' as const, horizon: 10, features: ['f'] },
          bear: { role: 'bear-researcher', thesis: 'bear', mechanism: 'mech', evidence: ['e'], expectedDirection: 'short' as const, horizon: 10, features: ['f'] },
          modelProvenance: [] as ModelProvenanceRecord[],
          toolProvenance: [] as ToolProvenance[],
        },
      }),
    }));

    const mockExtract = vi.fn().mockReturnValue({
      ok: true,
      value: { hypothesisA: {} as ResearchHypothesis, hypothesisB: {} as ResearchHypothesis },
    });

    vi.doMock('@/tree/research/tradingagents/hypothesis-extraction', () => ({
      extractHypotheses: mockExtract,
    }));

    vi.doMock('@/tree/research/evidence/lineage', () => ({
      buildLineage: vi.fn().mockReturnValue({} as ResearchLineage),
    }));

    vi.doMock('@/tree/research/alpha/compiler', () => ({
      compile: vi.fn().mockResolvedValue({ ok: true, value: {} as ExperimentSpec }),
    }));

    const customConfig = makeConfig({
      universe: { id: 'custom-universe', symbols: ['ETH-USD'], weighting: 'equal' as const, rebalanceRule: 'daily' as const },
      timeframe: '4h',
      nowIso: '2026-08-26T12:00:00.000Z',
      importerVersion: 'custom-2.0',
      defaultCostMode: 'NORMAL',
    });

    const { debateToHypothesis: freshDebateToHypothesis } = await import('./debate-to-hypothesis');
    await freshDebateToHypothesis(customConfig);

    // The implementation transforms bull/bear features: features.map(name => ({ name, lookback: horizon, params: {} }))
    // So the mock receives the transformed version, not the raw input
    expect(mockExtract).toHaveBeenCalledWith(
      expect.objectContaining({
        goalId: 'goal-1',
        bull: expect.objectContaining({
          role: 'bull',
          thesis: 'bull',
          mechanism: 'mech',
          evidence: ['e'],
          expectedDirection: 'long',
          horizon: 10,
          features: [{ name: 'f', lookback: 10, params: {} }],
        }),
        bear: expect.objectContaining({
          role: 'bear',
          thesis: 'bear',
          mechanism: 'mech',
          evidence: ['e'],
          expectedDirection: 'short',
          horizon: 10,
          features: [{ name: 'f', lookback: 10, params: {} }],
        }),
      }),
      expect.objectContaining({
        // universe is passed as-is from config
        universe: { id: 'custom-universe', symbols: ['ETH-USD'], weighting: 'equal', rebalanceRule: 'daily' },
        timeframe: '4h',
        nowIso: '2026-08-26T12:00:00.000Z',
        importerVersion: 'custom-2.0',
        defaultCostMode: 'NORMAL',
      })
    );
  });
});