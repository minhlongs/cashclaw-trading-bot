// Research Registry — barrel export
// knip entry glob matches `src/tree/**/index.ts`, so this barrel satisfies
// the knip entry requirement for the whole registry module.

export type {
  ResearchEntry,
  ResearchRegistry,
  ResearchStatus,
  ReproducibilityLevel,
  ResearchPeriod,
  ResearchCosts,
  ResearchSlippage,
  ResearchResult,
  RegistrySummary,
} from './types';

export {
  createRegistry,
  createRegistryFromEntries,
  addEntry,
  falsifyEntry,
  summarize,
  toCanonicalJson,
  entryConfigHash,
} from './registry';

export { SEED_FALSIFIED } from './seed-falsified';