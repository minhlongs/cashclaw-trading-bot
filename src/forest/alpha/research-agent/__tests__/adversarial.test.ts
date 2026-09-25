import { describe, it, expect, vi } from 'vitest';
import { DeterministicMockLLMProvider } from '@/forest/alpha/research-agent/mock-provider';
import { ProviderError, formatHypothesisPrompt, formatFeatureProposalPrompt, formatFailureDiagnosisPrompt, formatClusteringPrompt, formatNextExperimentPrompt } from '@/forest/alpha/research-agent/provider';
import { cleanJsonString, parseRawJson } from '@/forest/alpha/research-agent/schemas';
import { ResearchAgent, FalsificationGuardError, AgentValidationError, NonCausalFeatureError } from '@/forest/alpha/research-agent/agent';
import { diagnoseQueueJobFailure, recommendQueueFollowUp, createFollowUpJobSpec } from '@/forest/alpha/research-agent/seam';
import type { ResearchQueueJob } from '@/tree/alpha/queue/types';
import type { NextExperimentSpec } from '@/forest/alpha/research-agent/types';

const BASE_JOB: ResearchQueueJob = {
  id: 'qj-adv-001', hypothesis: 'Alpha', features: ['rsi'], dataset: 'ds-1', regime: 'all', universe: 'top-10' as never,
  costs: { feeBps: 10, impactBps: 5 }, slippage: { slippageBps: 3 }, seed: null, parentHypothesis: null,
  status: 'FALSIFIED', priority: 1, submittedAt: 1, startedAt: 2, completedAt: 3, workerId: 'w1', gitSha: 'abc',
  result: { oosPassCount: 0, oosTotalCount: 0, aggregatePnlUsd: 0, summary: '' },
} as never;

describe('Tier 5 White-Box Adversarial Coverage Hardening', () => {
  it('exercises ProviderError options defaults, error codes, and cause preservation', () => {
    const errDef = new ProviderError('default err');
    expect(errDef.code).toBe('PROVIDER_UNAVAILABLE');
    expect(errDef.providerName).toBe('unknown');
    expect(errDef.cause).toBeUndefined();
    const cause = new Error('root cause');
    const errCustom = new ProviderError('custom', { code: 'TIMEOUT', providerName: 'mock', cause });
    expect(errCustom.cause).toBe(cause);
    expect(errCustom.code).toBe('TIMEOUT');
  });

  it('exercises prompt formatters across all parameter branches and defaults', () => {
    const h1 = formatHypothesisPrompt({ domainCategory: 'arb', falsifiedClassesToExclude: ['retail-ta'], targetRegime: 'trending_up', maxProposals: 5, contextPrompt: 'custom ctx' });
    expect(h1.userPrompt).toContain('retail-ta');
    const h2 = formatHypothesisPrompt({ domainCategory: 'arb' });
    expect(h2.userPrompt).toContain('None specified');
    const f1 = formatFeatureProposalPrompt({ targetHypothesisId: 'h1', candidateIndicators: ['order_book_imbalance'] });
    expect(f1.userPrompt).toContain('"maxLookback":100');
    const f2 = formatFeatureProposalPrompt({ targetHypothesisId: 'h1', candidateIndicators: ['order_book_imbalance'], maxLookback: 50, context: 'causal only' });
    expect(f2.userPrompt).toContain('"maxLookback":50');
    const d1 = formatFailureDiagnosisPrompt({ jobId: 'j1', hypothesis: 'h1', reasons: ['fail'], metrics: { pnl: -10 }, summary: 'custom sum' });
    expect(d1.userPrompt).toContain('custom sum');
    const d2 = formatFailureDiagnosisPrompt({ jobId: 'j1', hypothesis: 'h1', reasons: ['fail'] });
    expect(d2.userPrompt).toContain('Job j1 failure analysis');
    const c1 = formatClusteringPrompt({ hypotheses: [], similarityThreshold: 0.9 });
    expect(c1.userPrompt).toContain('"similarityThreshold":0.9');
    const c2 = formatClusteringPrompt({ hypotheses: [] });
    expect(c2.userPrompt).toContain('"similarityThreshold":0.7');
    const n1 = formatNextExperimentPrompt({ completedJobId: 'comp-1', hypothesis: 'h1', status: 'SURVIVED', failureReasons: ['decay'], currentRegime: 'low_vol', maxRecommendations: 4 });
    expect(n1.userPrompt).toContain('"completedJobId":"comp-1"');
    const n2 = formatNextExperimentPrompt({ predecessorJobId: 'pred-1', hypothesis: 'h1', outcome: 'FALSIFIED' });
    expect(n2.userPrompt).toContain('"completedJobId":"pred-1"');
    const n3 = formatNextExperimentPrompt({ hypothesis: 'h1' });
    expect(n3.userPrompt).toContain('"status":"FALSIFIED"');
  });

  it('exercises DeterministicMockLLMProvider edge cases, setters, timeout, and fallback', async () => {
    const mock = new DeterministicMockLLMProvider({ overrides: { hypothesis_generation: '[]' } });
    mock.setHypothesisFixture('[]'); mock.setFeatureFixture('[]'); mock.setDiagnosisFixture('{}'); mock.setClusteringFixture('[]'); mock.setNextExperimentFixture('[]');
    mock.simulateTimeout(true);
    await expect(mock.generateCompletion({ capability: 'hypothesis_generation', systemPrompt: '', userPrompt: '', temperature: 0 })).rejects.toThrow(ProviderError);
    mock.simulateTimeout(false);
    mock.reset();
    const resH = await mock.generateCompletion({ capability: 'hypothesis_generation', systemPrompt: '', userPrompt: '', temperature: 0 });
    expect(resH).toContain('hyp-mock-001');
    const resCBadJson = await mock.generateCompletion({ capability: 'hypothesis_clustering', systemPrompt: '', userPrompt: '{invalid json', temperature: 0 });
    expect(resCBadJson).toContain('cluster-mock-001');
    await expect(mock.generateCompletion({ capability: 'unknown_cap' as never, systemPrompt: '', userPrompt: '', temperature: 0 })).rejects.toThrow('Unknown capability');
    expect(mock.getCallHistory().length).toBeGreaterThan(0);
  });

  it('exercises schemas cleanJsonString fences and parseRawJson error paths', () => {
    expect(cleanJsonString('```json\n{"val": 42}\n```')).toBe('{"val": 42}');
    expect(cleanJsonString('```json\n{"val": 42}')).toBe('{"val": 42}');
    expect(cleanJsonString('  {"plain": 1}  ')).toBe('{"plain": 1}');
    expect(() => parseRawJson('{bad json', 'testCtx')).toThrow('Failed to parse JSON for testCtx');
    const spy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => { throw 'raw-string-error'; });
    expect(() => parseRawJson('{}', 'testCtx')).toThrow('Failed to parse JSON for testCtx: raw-string-error');
    spy.mockRestore();
  });

  it('exercises ResearchAgent validation, tokens, causality, and clustering singletons', async () => {
    const mock = new DeterministicMockLLMProvider();
    const agent = new ResearchAgent({ provider: mock });
    mock.setHypothesisFixture(JSON.stringify([{ id: 'id-exact', title: 'T', rationale: 'R', domainCategory: 'cat', proposedMetrics: { s: 1 }, falsificationCriteria: ['f'] }]));
    const safeRes = await agent.generateHypotheses({ domainCategory: 'cat', falsifiedClassesToExclude: ['id-exact', '---'], strictFalsificationBlock: false });
    expect(safeRes).toEqual([]);
    mock.setHypothesisFixture(JSON.stringify([{ id: 'id-mean', title: 'reversion alpha', rationale: 'R', domainCategory: 'cat', proposedMetrics: { s: 1 }, falsificationCriteria: ['f'] }]));
    const meanRes = await agent.generateHypotheses({ domainCategory: 'cat', falsifiedClassesToExclude: ['mean-reversion'], strictFalsificationBlock: false });
    expect(meanRes).toEqual([]);
    mock.setHypothesisFixture('123');
    await expect(agent.generateHypotheses({ domainCategory: 'cat' })).rejects.toThrow(AgentValidationError);
    mock.setHypothesisFixture('null');
    await expect(agent.generateHypotheses({ domainCategory: 'cat' })).rejects.toThrow(AgentValidationError);
    mock.setHypothesisFixture(JSON.stringify({ proposals: [{ id: 'novel-env', title: 'Novel Envelope', rationale: 'R', domainCategory: 'cat', proposedMetrics: { s: 1 }, falsificationCriteria: ['f'] }] }));
    const envRes = await agent.generateHypotheses({ domainCategory: 'cat', maxProposals: 1 });
    expect(envRes).toHaveLength(1);
    mock.setFeatureFixture(JSON.stringify([{ name: 'f_lead', indicators: ['lead_signal'], combinationLogic: 'lead(rsi, 1)', lookbackPeriods: [14], causalJustification: 'Uses future' }]));
    await expect(agent.proposeFeatureCombinations({ targetHypothesisId: 'h1', candidateIndicators: ['lead_signal'] })).rejects.toThrow(NonCausalFeatureError);
    mock.setFeatureFixture(JSON.stringify([{ name: 'f_tplus', indicators: ['t_plus_1'], combinationLogic: 'rsi + 1', lookbackPeriods: [14], causalJustification: 'Causal justification' }]));
    await expect(agent.proposeFeatureCombinations({ targetHypothesisId: 'h1', candidateIndicators: ['t_plus_1'] })).rejects.toThrow(NonCausalFeatureError);
    mock.setDiagnosisFixture('null');
    await expect(agent.explainFailure({ jobId: 'j1', hypothesis: 'h1', reasons: ['fail'] })).rejects.toThrow(AgentValidationError);
    mock.setDiagnosisFixture(JSON.stringify({ diagnosis: { jobId: 'j1', primaryFailureReason: 'drawdown', contributingFactors: [], metricShortfalls: {}, recommendations: ['halt'] } }));
    const diagWithEnvelope = await agent.explainFailure({ jobId: 'j1', hypothesis: 'h1', reasons: ['fail'] });
    expect(diagWithEnvelope.primaryFailureReason).toBe('drawdown');
    mock.reset();
    const clusterEmpty = await agent.clusterHypotheses({ hypotheses: [] });
    expect(clusterEmpty).toEqual([]);
    const clusterOne = await agent.clusterHypotheses({ hypotheses: [{ id: 'h-1', title: 'Solo Alpha', rationale: null }] });
    expect(clusterOne).toHaveLength(1);
    expect(clusterOne[0].clusterId).toBe('cluster-h-1');
    const recPred = await agent.recommendNextExperiments({ hypothesis: 'H', predecessorJobId: 'pred-job-1' });
    expect(recPred[0].parentJobId).toBe('pred-job-1');
    const recNone = await agent.recommendNextExperiments({ hypothesis: 'H' });
    expect(recNone[0].parentJobId).toBeUndefined();
  });

  it('exercises ResearchAgent proposedFeatures exact and multi-subset matching and extraExcluded tokens', async () => {
    const exactProposal = [{ id: 'novel-1', title: 'Novel Strategy', rationale: 'Novel test', domainCategory: 'stat_arb', proposedMetrics: { sharpe: 1.5 }, falsificationCriteria: ['p < 0.05'], proposedFeatures: ['sma_fast', 'sma_slow'] }];
    const mock = new DeterministicMockLLMProvider();
    mock.setHypothesisFixture(JSON.stringify(exactProposal));
    const agent = new ResearchAgent({ provider: mock });
    await expect(agent.generateHypotheses({ domainCategory: 'stat_arb', strictFalsificationBlock: true })).rejects.toThrow(FalsificationGuardError);
    const idProposal = [{ id: 'sma-crossover', title: 'SMA Crossover Strategy', rationale: 'Direct id match', domainCategory: 'trend', proposedMetrics: { sharpe: 1.5 }, falsificationCriteria: ['p < 0.05'] }];
    mock.setHypothesisFixture(JSON.stringify(idProposal));
    await expect(agent.generateHypotheses({ domainCategory: 'trend', strictFalsificationBlock: true })).rejects.toThrow(FalsificationGuardError);
    const subsetProposal = [{ id: 'novel-2', title: 'Momentum Mix', rationale: 'Testing subset', domainCategory: 'trend', proposedMetrics: { sharpe: 1.5 }, falsificationCriteria: ['p < 0.05'], proposedFeatures: ['macd', 'macd_signal', 'volume_delta'] }];
    mock.setHypothesisFixture(JSON.stringify(subsetProposal));
    await expect(agent.generateHypotheses({ domainCategory: 'trend', strictFalsificationBlock: true })).rejects.toThrow(FalsificationGuardError);
    const tokenProposal = [{ id: 'novel-3', title: 'Arbitrary Title', rationale: 'Uses custom-falsified alpha token here', domainCategory: 'trend', proposedMetrics: { sharpe: 1.5 }, falsificationCriteria: ['p < 0.05'] }];
    mock.setHypothesisFixture(JSON.stringify(tokenProposal));
    await expect(agent.generateHypotheses({ domainCategory: 'trend', falsifiedClassesToExclude: ['custom-falsified'], strictFalsificationBlock: true })).rejects.toThrow(FalsificationGuardError);
  });

  it('exercises seam edge cases: recommendations, cancelled jobs, and follow-up specs', async () => {
    const mock = new DeterministicMockLLMProvider();
    const agent = new ResearchAgent({ provider: mock });
    const recSurv = await recommendQueueFollowUp(agent, { ...BASE_JOB, status: 'SURVIVED' });
    expect(recSurv.hypothesisId).toBe('hyp-mock-followup-001');
    const recFals = await recommendQueueFollowUp(agent, { ...BASE_JOB, status: 'FALSIFIED' });
    expect(recFals.hypothesisId).toBe('hyp-mock-followup-001');
    const mockAgentNoParent = {
      recommendNextExperiments: vi.fn().mockResolvedValue([{ hypothesisId: 'h-nopar', title: 'T', rationale: 'R', proposedParameters: {}, parentJobId: undefined }]),
    } as unknown as ResearchAgent;
    const resNoParent = await recommendQueueFollowUp(mockAgentNoParent, BASE_JOB);
    expect(resNoParent.parentJobId).toBe(BASE_JOB.id);
    const mockAgentEmpty = { recommendNextExperiments: vi.fn().mockResolvedValue([]) } as unknown as ResearchAgent;
    await expect(recommendQueueFollowUp(mockAgentEmpty, BASE_JOB)).rejects.toThrow('ResearchAgent returned no recommendations');
    await expect(diagnoseQueueJobFailure(agent, { ...BASE_JOB, status: 'SURVIVED' })).rejects.toThrow('status SURVIVED');
    const diagSurvFalsifiedVerdict = await diagnoseQueueJobFailure(agent, { ...BASE_JOB, status: 'SURVIVED', result: { oosPassCount: 1, oosTotalCount: 2, aggregatePnlUsd: 100, summary: '' } }, { verdict: 'falsified', pValue: 0.8, reasons: [] } as never);
    expect(diagSurvFalsifiedVerdict.jobId).toBe(BASE_JOB.id);
    const diagCancelled = await diagnoseQueueJobFailure(agent, { ...BASE_JOB, status: 'CANCELLED', result: undefined, costs: undefined, slippage: undefined } as never);
    expect(diagCancelled.jobId).toBe(BASE_JOB.id);
    const spec: NextExperimentSpec = { hypothesisId: 'h-next', title: '', proposedParameters: { features: ['ema-20'], dataset: 'binance-1h', universe: 'top-50' }, targetRegime: 'trending_up', rationale: 'Next steps' };
    const jobSpec = createFollowUpJobSpec(BASE_JOB, spec, { id: 'custom-job-id', gitSha: null, generatedBy: 'adv-test' });
    expect(jobSpec.id).toBe('custom-job-id');
    expect(jobSpec.hypothesis).toBe('Alpha (follow-up)');
    expect(jobSpec.features).toEqual(['ema-20']);
    expect(jobSpec.dataset).toBe('binance-1h');
    expect(jobSpec.universe).toBe('top-50');
    expect(jobSpec.regime).toBe('trending_up');
    expect(jobSpec.gitSha).toBeNull();
    expect(jobSpec.generatedBy).toBe('adv-test');
    const bareSpec = createFollowUpJobSpec({ ...BASE_JOB, costs: undefined as never, slippage: undefined as never }, { hypothesisId: 'h-bare', title: 'Explicit Title', proposedParameters: undefined as never, rationale: 'R' });
    expect(bareSpec.hypothesis).toBe('Explicit Title');
    expect(bareSpec.costs).toBeUndefined();
    expect(bareSpec.id).toContain('job-h-bare');
  });
});
