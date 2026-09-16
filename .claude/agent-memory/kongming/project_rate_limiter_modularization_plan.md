---
name: project-rate-limiter-modularization-plan
description: 2026-09-14 plan at .orchestrate/latest/plan.md; types, token-bucket, backoff, rate-limiter, index facade, <= 200 LOC budget, zero regression
metadata:
  type: project
---

Exchange rate limiter modularization plan written to `.orchestrate/latest/plan.md`.

**Why:** `src/tree/exchange/rate-limiter/index.ts` is 250 LOC, violating the repository's strict <= 200 LOC ceiling constraint.
**How to apply:** Guide decomposition into `types.ts` (~45 LOC), `token-bucket.ts` (~55 LOC), `backoff.ts` (~45 LOC), `rate-limiter.ts` (~135 LOC), and thin `index.ts` facade (~30 LOC) maintaining strict 100% backward compatibility across 71 tests in `src/tree/exchange/rate-limiter/` and 4,108+ repo tests.
