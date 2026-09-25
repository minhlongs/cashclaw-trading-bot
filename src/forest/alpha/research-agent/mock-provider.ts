// CashClaw Alpha Research OS — Deterministic Mock LLM Provider
// Reproducible, schema-valid fixtures and simulation controls for CI/offline testing.
import type { LLMPromptPayload, ResearchCapability, ResearchLLMProvider } from './types';
import { ProviderError } from './provider';

export const DEFAULT_HYPOTHESIS_FIXTURE = JSON.stringify([
  {
    id: 'hyp-mock-001',
    title: 'Funding-Volume Divergence Reversion',
    rationale: 'Extreme divergence between perpetual funding rates and spot trade volume predicts short-term mean reversion.',
    domainCategory: 'derivatives_interaction',
    proposedMetrics: { minSharpe: 1.2, minTrades: 30 },
    falsificationCriteria: ['Bootstrap CI lower bound <= 0', 'Permutation p-value >= 0.05'],
  },
]);

export const DEFAULT_FEATURE_FIXTURE = JSON.stringify([
  {
    name: 'orderbook_volume_ratio',
    indicators: ['order_book_imbalance', 'volume_delta'],
    combinationLogic: 'order_book_imbalance / (abs(volume_delta) + 1e-4)',
    lookbackPeriods: [14, 28],
    causalJustification: 'Uses backward-looking realized depth and trade volume with zero look-ahead bias.',
  },
]);

export const DEFAULT_DIAGNOSIS_FIXTURE = JSON.stringify({
  jobId: 'job-mock-falsified-001',
  primaryFailureReason: 'Transaction cost drag under 27 bps round-trip fee model',
  contributingFactors: ['High trade turnover', 'Inadequate holding horizon'],
  metricShortfalls: {
    netPnlUsd: { expected: 1500, actual: -420 },
    profitFactor: { expected: 1.2, actual: 0.82 },
  },
  recommendations: ['Increase signal threshold to filter low-conviction entries', 'Extend minimum holding period'],
});

export const DEFAULT_CLUSTERING_FIXTURE = JSON.stringify([
  {
    clusterId: 'cluster-mock-001',
    theme: 'Order Book Microstructure',
    memberIds: ['hyp-mock-001', 'hyp-mock-002'],
    redundancyScore: 0.88,
    recommendedRepresentativeId: 'hyp-mock-001',
  },
]);

export const DEFAULT_NEXT_EXPERIMENT_FIXTURE = JSON.stringify([
  {
    hypothesisId: 'hyp-mock-followup-001',
    title: 'Filtered Funding Divergence with Volatility Regime Lock',
    proposedParameters: { minVolumeZ: 2.0, regimeFilter: 'trending_up' },
    targetRegime: 'trending_up',
    rationale: 'Restricts trading to trending regimes to mitigate turnover cost drag observed in prior run.',
  },
]);

export interface MockCallRecord {
  readonly payload: LLMPromptPayload;
  readonly timestamp: number;
}

export interface MockProviderOptions {
  readonly simulatedError?: Error | null;
  readonly overrides?: Partial<Record<ResearchCapability, string>>;
}

export class DeterministicMockLLMProvider implements ResearchLLMProvider {
  public readonly name = 'DeterministicMockLLMProvider';
  private readonly callHistory: MockCallRecord[] = [];
  private isTimeoutSimulated = false;
  private customHypothesisFixture: string | null = null;
  private customFeatureFixture: string | null = null;
  private customDiagnosisFixture: string | null = null;
  private customClusteringFixture: string | null = null;
  private customNextExperimentFixture: string | null = null;

  constructor(options: MockProviderOptions = {}) {
    if (options.overrides?.hypothesis_generation) {
      this.customHypothesisFixture = options.overrides.hypothesis_generation;
    }
  }

  public setHypothesisFixture(fixture: string): void {
    this.customHypothesisFixture = fixture;
  }

  public setFeatureFixture(fixture: string): void {
    this.customFeatureFixture = fixture;
  }

  public setDiagnosisFixture(fixture: string): void {
    this.customDiagnosisFixture = fixture;
  }

  public setClusteringFixture(fixture: string): void {
    this.customClusteringFixture = fixture;
  }

  public setNextExperimentFixture(fixture: string): void {
    this.customNextExperimentFixture = fixture;
  }

  public simulateTimeout(enable: boolean): void {
    this.isTimeoutSimulated = enable;
  }

  public getCallHistory(): readonly MockCallRecord[] {
    return [...this.callHistory];
  }

  public reset(): void {
    this.callHistory.length = 0;
    this.isTimeoutSimulated = false;
    this.customHypothesisFixture = null;
    this.customFeatureFixture = null;
    this.customDiagnosisFixture = null;
    this.customClusteringFixture = null;
    this.customNextExperimentFixture = null;
  }

  public async generateCompletion(payload: LLMPromptPayload): Promise<string> {
    this.callHistory.push({ payload, timestamp: Date.now() });

    if (this.isTimeoutSimulated) {
      throw new ProviderError('Simulated request timeout after 10000ms', {
        code: 'TIMEOUT',
        providerName: this.name,
      });
    }

    switch (payload.capability) {
      case 'hypothesis_generation':
        return this.customHypothesisFixture ?? DEFAULT_HYPOTHESIS_FIXTURE;
      case 'feature_proposal':
        return this.customFeatureFixture ?? DEFAULT_FEATURE_FIXTURE;
      case 'failure_diagnosis':
        return this.customDiagnosisFixture ?? DEFAULT_DIAGNOSIS_FIXTURE;
      case 'hypothesis_clustering': {
        if (this.customClusteringFixture) return this.customClusteringFixture;
        try {
          const userObj = JSON.parse(payload.userPrompt) as { hypotheses?: { id: string }[] };
          if (Array.isArray(userObj.hypotheses) && userObj.hypotheses.length > 0) {
            const memberIds = userObj.hypotheses.map((h) => h.id);
            return JSON.stringify([{
              clusterId: 'cluster-mock-001',
              theme: 'Order Book Microstructure',
              memberIds,
              redundancyScore: 0.88,
              recommendedRepresentativeId: memberIds[0],
            }]);
          }
        } catch {
          // fallback
        }
        return DEFAULT_CLUSTERING_FIXTURE;
      }
      case 'next_experiment':
        return this.customNextExperimentFixture ?? DEFAULT_NEXT_EXPERIMENT_FIXTURE;
      default:
        throw new ProviderError(`Unknown capability: ${String(payload.capability)}`, {
          code: 'PROVIDER_UNAVAILABLE',
          providerName: this.name,
        });
    }
  }
}
