import type { LLMPromptPayload, ResearchCapability } from './types';

export interface MockCallRecord {
  readonly payload: LLMPromptPayload;
  readonly timestamp: number;
}

export interface MockProviderOptions {
  readonly simulatedError?: Error | null;
  readonly overrides?: Partial<Record<ResearchCapability, string>>;
}

export interface MockCustomFixtures {
  hypothesis: string | null;
  feature: string | null;
  diagnosis: string | null;
  clustering: string | null;
  nextExperiment: string | null;
}
