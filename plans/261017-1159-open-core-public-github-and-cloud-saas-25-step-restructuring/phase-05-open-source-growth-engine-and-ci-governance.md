---
phase: 5
title: "Phase 5: Open-Source Growth Engine and CI Governance (Steps 21–25)"
status: todo
priority: P2
effort: "0.5d"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Open-Source Growth Engine and CI Governance (Steps 21–25)

## Overview
Complete the public GitHub launch surface: automated CI quality & open-core boundary workflow, bilingual Open-Source vs. Cloud SaaS comparison documentation (`docs/open-core-saas-blueprint.md` and `README.md`), community Alpha/QuantLib contribution templates, release/badge metadata, and privacy-first conversion funnel telemetry.

## Requirements
- **Functional:**
  - Step 21: Create/update GitHub Actions workflow `.github/workflows/open-core-ci.yml` running typecheck, lint, open-core boundary tests, and full test suite.
  - Step 22: Update `README.md` and create `docs/open-core-saas-architecture.md` (bilingual VI/EN) with clear **Self-Hosted Apache-2.0 vs. CashClaw Cloud SaaS** comparison table and 60-second quickstart.
  - Step 23: Create `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/alpha-hypothesis.md` for community quant contributions.
  - Step 24: Update `docs/development-roadmap.md` and `docs/project-changelog.md` recording the 25-step Open-Core + Cloud SaaS transformation.
  - Step 25: Implement privacy-first opt-in conversion funnel tracker `src/ee/telemetry/conversion-funnel.ts` measuring `CLI_BACKTEST -> CLOUD_SIGNUP -> SYNC_BOT -> PAID_SUBSCRIPTION` without collecting PII or strategies.
- **Non-functional:**
  - Bilingual (`vi` + `en`) documentation, < 200 LOC per code file, all quality gates green.

## Architecture
```
.github/
├── workflows/open-core-ci.yml          # Step 21: Automated OSS + EE boundary CI gate
├── PULL_REQUEST_TEMPLATE.md            # Step 23: Community Quant PR checklist
└── ISSUE_TEMPLATE/alpha-hypothesis.md  # Step 23: Causal Alpha submission template
docs/
└── open-core-saas-architecture.md      # Step 22: Bilingual Open-Core & SaaS monetization guide
src/ee/telemetry/
└── conversion-funnel.ts                # Step 25: Privacy-first OSS -> SaaS funnel metrics
```

## Related Code Files
- Create: `.github/workflows/open-core-ci.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/ISSUE_TEMPLATE/alpha-hypothesis.md`
- Create: `docs/open-core-saas-architecture.md`
- Create: `src/ee/telemetry/conversion-funnel.ts`
- Create: `src/ee/__tests__/conversion-funnel.test.ts`
- Modify: `README.md`
- Modify: `docs/development-roadmap.md`
- Modify: `docs/project-changelog.md`

## Implementation Steps
1. **Step 21 (`open-core-ci.yml`):** Configure GitHub Actions workflow verifying `npm run typecheck`, `npm run lint`, and `npm test`.
2. **Step 22 (`open-core-saas-architecture.md` & `README.md`):** Document the 25-step Open-Core architecture and bilingual feature matrix (`OSS Free` vs `BASIC` vs `PREMIUM` vs `ENTERPRISE` vs `MASTER`).
3. **Step 23 (GitHub Templates):** Add PR and Alpha Hypothesis templates requiring causal features (`causal: true`), fee/slippage inclusion, and < 200 LOC files.
4. **Step 24 (Roadmap & Changelog):** Record the Open-Core & Cloud SaaS milestone in `docs/development-roadmap.md` and `docs/project-changelog.md`.
5. **Step 25 (`conversion-funnel.ts`):** Implement pure funnel stage transition calculator and conversion rate aggregator in `src/ee/telemetry/conversion-funnel.ts` with unit tests.

## Todo
- [x] Step 21: Create `.github/workflows/open-core-ci.yml`
- [x] Step 22: Create `docs/open-core-saas-architecture.md` and update `README.md`
- [x] Step 23: Create `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/alpha-hypothesis.md`
- [x] Step 24: Update `docs/development-roadmap.md` and `docs/project-changelog.md`
- [x] Step 25: Implement `src/ee/telemetry/conversion-funnel.ts` and `conversion-funnel.test.ts`

## Success Criteria
- [x] `$HOME/bin/ak plan validate` passes on the plan directory.
- [x] Conversion funnel tests and full repository test suite pass with 0 errors.

## Risk Assessment
- **Risk:** Telemetry raises privacy objections among open-source developers.
- **Mitigation:** `conversion-funnel.ts` is strictly opt-in (`telemetryOptIn: boolean`), strips all strategy formulas/keys, and only counts aggregate stage transitions.
