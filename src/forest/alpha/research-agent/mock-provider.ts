import type { LLMPromptPayload, ResearchLLMProvider } from './types';
import { ProviderError } from './provider';
import type { MockCallRecord, MockCustomFixtures, MockProviderOptions } from './mock-provider-types';
import { resolveMockCompletion } from './mock-provider-dispatch';

export type { MockCallRecord, MockProviderOptions } from './mock-provider-types';

export class DeterministicMockLLMProvider implements ResearchLLMProvider {
  public readonly name = 'DeterministicMockLLMProvider';
  private readonly callHistory: MockCallRecord[] = [];
  private isTimeoutSimulated = false;
  private fixtures: MockCustomFixtures = { hypothesis: null, feature: null, diagnosis: null, clustering: null, nextExperiment: null };

  constructor(options: MockProviderOptions = {}) {
    if (options.overrides?.hypothesis_generation) this.fixtures.hypothesis = options.overrides.hypothesis_generation;
  }
  public setHypothesisFixture(f: string): void { this.fixtures.hypothesis = f; }
  public setFeatureFixture(f: string): void { this.fixtures.feature = f; }
  public setDiagnosisFixture(f: string): void { this.fixtures.diagnosis = f; }
  public setClusteringFixture(f: string): void { this.fixtures.clustering = f; }
  public setNextExperimentFixture(f: string): void { this.fixtures.nextExperiment = f; }
  public simulateTimeout(enable: boolean): void { this.isTimeoutSimulated = enable; }
  public getCallHistory(): readonly MockCallRecord[] { return [...this.callHistory]; }
  public reset(): void {
    this.callHistory.length = 0; this.isTimeoutSimulated = false;
    this.fixtures = { hypothesis: null, feature: null, diagnosis: null, clustering: null, nextExperiment: null };
  }
  public async generateCompletion(payload: LLMPromptPayload): Promise<string> {
    this.callHistory.push({ payload, timestamp: Date.now() });
    if (this.isTimeoutSimulated) {
      throw new ProviderError('Simulated request timeout after 10000ms', { code: 'TIMEOUT', providerName: this.name });
    }
    return resolveMockCompletion(payload, this.fixtures, this.name);
  }
}
