// Debate-to-Hypothesis failure-path tests — covers orchestrator failure, extraction failure,
// lineage build catch, and partial compile failure paths.
// Happy-path and config-forwarding tests live in debate-to-hypothesis-success.test.ts (< 250 LOC).

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
  } as unknown as ModelRouter;
}

function makeConfig(overrides: Partial<{
  orchestratorConfig: Partial<DebateOrchestratorConfig>;
  router: ModelRouter;
  dataWindow: unknown;
  universe: unknown;
  timeframe: string;
  nowIso: string;
  importerVersion: string;
  defaultCostMode: string;
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
  } as unknown as Parameters<typeof debateToHypothesis>[0];
}

describe('debateToHypothesis — failure paths', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns orchestrator failure when orchestrator fails', async () => {
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
        throw 'string throw';
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
      compile: vi.fn().mockImplementation(async (h: { id: string }) => {
        compileCallCount++;
        if (h.id === 'hyp-A') {
          return { ok: false, reasons: ['compile failed: missing data'] };
        }
        return { ok: true, value: { id: 'spec-B' } as unknown as ExperimentSpec };
      }),
    }));

    const { debateToHypothesis: freshDebateToHypothesis } = await import('./debate-to-hypothesis');
    const result = await freshDebateToHypothesis(makeConfig());
    expect(compileCallCount).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0]).toContain('compile(hyp-A): compile failed');
    }
  });
});
