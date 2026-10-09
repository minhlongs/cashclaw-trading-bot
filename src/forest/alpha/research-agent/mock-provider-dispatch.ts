import type { LLMPromptPayload } from './types';
import { ProviderError } from './provider';
import type { MockCustomFixtures } from './mock-provider-types';
import {
  DEFAULT_HYPOTHESIS_FIXTURE,
  DEFAULT_FEATURE_FIXTURE,
  DEFAULT_DIAGNOSIS_FIXTURE,
  DEFAULT_CLUSTERING_FIXTURE,
  DEFAULT_NEXT_EXPERIMENT_FIXTURE,
} from './mock-provider-fixtures';

export function resolveClusteringFixture(payload: LLMPromptPayload, custom: string | null): string {
  if (custom) return custom;
  try {
    const userObj = JSON.parse(payload.userPrompt) as { hypotheses?: { id: string }[] };
    if (Array.isArray(userObj.hypotheses) && userObj.hypotheses.length > 0) {
      const memberIds = userObj.hypotheses.map((h) => h.id);
      return JSON.stringify([{
        clusterId: 'cluster-mock-001', theme: 'Order Book Microstructure',
        memberIds, redundancyScore: 0.88, recommendedRepresentativeId: memberIds[0],
      }]);
    }
  } catch {
    // fallback
  }
  return DEFAULT_CLUSTERING_FIXTURE;
}

export function resolveMockCompletion(payload: LLMPromptPayload, fix: MockCustomFixtures, name: string): string {
  switch (payload.capability) {
    case 'hypothesis_generation': return fix.hypothesis ?? DEFAULT_HYPOTHESIS_FIXTURE;
    case 'feature_proposal': return fix.feature ?? DEFAULT_FEATURE_FIXTURE;
    case 'failure_diagnosis': return fix.diagnosis ?? DEFAULT_DIAGNOSIS_FIXTURE;
    case 'hypothesis_clustering': return resolveClusteringFixture(payload, fix.clustering);
    case 'next_experiment': return fix.nextExperiment ?? DEFAULT_NEXT_EXPERIMENT_FIXTURE;
    default: throw new ProviderError(`Unknown capability: ${String(payload.capability)}`, { code: 'PROVIDER_UNAVAILABLE', providerName: name });
  }
}
