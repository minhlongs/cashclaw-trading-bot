// CashClaw Alpha Research OS — Deterministic Mock LLM Provider
// Reproducible, schema-valid fixtures and simulation controls for CI/offline testing.
import type { LLMPromptPayload, ResearchCapability, ResearchLLMProvider } from './types';
import { ProviderError } from './provider';
import {
  DEFAULT_HYPOTHESIS_FIXTURE,
  DEFAULT_FEATURE_FIXTURE,
  DEFAULT_DIAGNOSIS_FIXTURE,
  DEFAULT_CLUSTERING_FIXTURE,
  DEFAULT_NEXT_EXPERIMENT_FIXTURE,
} from './mock-provider-fixtures';

export {
  DEFAULT_HYPOTHESIS_FIXTURE,
  DEFAULT_FEATURE_FIXTURE,
  DEFAULT_DIAGNOSIS_FIXTURE,
  DEFAULT_CLUSTERING_FIXTURE,
  DEFAULT_NEXT_EXPERIMENT_FIXTURE,
};

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
