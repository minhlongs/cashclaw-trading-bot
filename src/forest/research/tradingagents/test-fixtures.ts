// Test fixtures — DeterministicFixtureProvider for forest-layer tests.
// Labeled TEST seam (D11), not real LLM deliberation quality.

export { CANNED_RESPONSES, detectRole } from './test-fixtures-canned';
export {
  DeterministicFixtureProvider,
  FailingProvider,
  makeFixtureProvider,
  makeFailingFixtureProvider,
} from './test-fixtures-providers';
