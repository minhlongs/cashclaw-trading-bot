---
title: "25-Step Open-Core & Cloud SaaS Runtime Seam Closure"
description: "Close all 5 runtime seams (G1–G5) discovered during --deep introspection of the 25-Step Open-Core & Cloud SaaS architecture."
status: completed
priority: P1
effort: "2d"
branch: main
tags: [open-core, saas, d1, nowpayments, quota-guard, alpha-feed, cloud-alerts, cron-lease]
created: 2026-10-17
---

# 25-Step Open-Core & Cloud SaaS Runtime Seam Closure

**Brainstorm Report:** [`plans/reports/20261017-open-core-saas-25-steps-deep-introspection-report.md`](../reports/20261017-open-core-saas-25-steps-deep-introspection-report.md)

## Overview

Close the 5 runtime integration seams identified in `--deep` code introspection so the 25-step Open-Core (Apache-2.0) + Cloud SaaS (`src/ee/`) architecture operates end-to-end with real tenant bot counts, D1-backed entitlement & NOWPayments IPN persistence, Cloud Alpha Feed & Signed Alert HTTP endpoints, and Cloudflare Worker cron lease protection.

## Phases

| # | Phase | Scope | Status |
|---|-------|-------|--------|
| 1 | [Phase 1: Quota & Sync Runtime Wiring (G1 + G3)](./phase-01-quota-and-sync-runtime-wiring.md) | `src/app/api/bots/route.ts`, `src/app/api/ee/sync/route.ts` | Completed |
| 2 | [Phase 2: D1 SaaS Entitlement & IPN Store (G2)](./phase-02-d1-saas-entitlement-and-ipn-store.md) | `src/ee/billing/saas-entitlement-store.ts`, `src/app/api/ee/billing/nowpayments-ipn/route.ts` | Completed |
| 3 | [Phase 3: Cloud Alpha Feed, Alerts API & Cron Lease (G4 + G5)](./phase-03-cloud-alpha-alerts-api-and-cron-lease.md) | `src/app/api/ee/alpha-feed/route.ts`, `src/app/api/ee/alerts/route.ts`, `src/worker-cron.ts` | Completed |
| 4 | [Phase 4: End-to-End Integration Tests & OSS Boundary Verification](./phase-04-e2e-tests-and-oss-boundary-verification.md) | Unit/integration tests, `npx cashclaw steps`, `npm test`, `npm run build` | Completed |

## Key Dependencies & Constraints

- **Safety Invariant (ADR-001):** 100% `PAPER/BACKTEST ONLY`.
- **Zero-Leak Boundary:** `src/tree/**` must never import from `src/ee/**`.
- **Code Standards:** `< 200 LOC` per file, `0 :any`, `0 console.log`, `0 eslint-disable`.
