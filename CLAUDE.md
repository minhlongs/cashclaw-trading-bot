# Playbook 5 — Continue primary plan

## Decision snapshot
- **Highest-value next phase:** ProviderChain + provenance + cross-provider consistency tests.
- **Required pre-step:** ensure `src/tree/exchange/provider/provider.ts` exists as the re-export/facade.
- **Quantlib stub:** create in Phase 01 path next; fix quantlib stub before ProviderChain if type-check blocks the build.
- **Evidence sources consulted:** grep on `CircuitBreaker.getState()` and `source_tool` for `provider.ts`.

## Rationale
Execution must avoid blocking tags (`provider.ts` missing) and test flakiness from nondeterminism; the plan is complete from planning phase; start provided as a helpful constraint.