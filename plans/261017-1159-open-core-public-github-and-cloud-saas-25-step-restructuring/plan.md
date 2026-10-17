---
title: "Open-Core Public GitHub and Cloud SaaS 25-Step Restructuring"
description: "Transform CashClaw (trade-bot) into an Apache-2.0 Open-Core Public GitHub project with a Proprietary Cloud SaaS layer (src/ee/) for recurring revenue."
status: pending
priority: P1
effort: "5d"
tags: [open-core, saas, apache-2.0, enterprise-edition, billing, quantlib]
created: 2026-10-17
---

# Open-Core Public GitHub and Cloud SaaS 25-Step Restructuring

## Overview

Restructure CashClaw (`trade-bot`) across 5 phases (25 concrete steps) into an **Open-Core** monorepo:
- **Community Core (`src/tree/`, `src/land/`, single-user local mode):** Licensed under **Apache-2.0** to drive GitHub adoption, academic citations, and community contributions.
- **Enterprise / Cloud SaaS (`src/ee/`):** Licensed under **CashClaw Commercial License** (`BASIC | PREMIUM | ENTERPRISE | MASTER`) delivering 24/7 Cloudflare Workers cron execution, Managed TradingAgents LLM Router, Cloud Alpha Feed, Real-time Telegram/Webhook alerts, and NOWPayments IPN + Stripe billing.

**Brainstorm Contract:** [`plans/reports/20261017-open-core-saas-25-steps-brainstorm-report.md`](../reports/20261017-open-core-saas-25-steps-brainstorm-report.md)

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Sanitize repository, establish Apache-2.0 + EE Commercial licensing, and enforce zero-leak import boundaries (Steps 1–5) | P1 |
| 2 | Expose `@cashclaw/quantlib` & `@cashclaw/alpha-zoo` public barrel exports, CLI runner, and 60s zero-config local demo (Steps 6–10) | P1 |
| 3 | Build `src/ee/` Cloud SaaS value moat: multi-tenancy, 24/7 durable cron, managed LLM deliberation quota, Cloud Alpha feed, and alerts (Steps 11–15) | P1 |
| 4 | Implement 4-tier SaaS entitlements (`BASIC`/`PREMIUM`/`ENTERPRISE`/`MASTER`), NOWPayments IPN + Stripe webhooks, and 1-click Local-to-Cloud Sync Bridge (Steps 16–20) | P1 |
| 5 | Launch public GitHub CI quality gates, bilingual OSS vs. Cloud comparison landing, community PR templates, and funnel telemetry (Steps 21–25) | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: IP Sanitization & Licensing Boundary (Steps 1–5)](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Modular Package Extraction and CLI Experience (Steps 6–10)](./phase-02-modular-package-extraction-and-cli-experience.md) | Pending |
| 3 | [Phase 3: SaaS Value Moat and Cloud-Only Architecture (Steps 11–15)](./phase-03-saas-value-moat-and-cloud-only-architecture.md) | Pending |
| 4 | [Phase 4: SaaS Billing Quotas and Conversion Funnel (Steps 16–20)](./phase-04-saas-billing-quotas-and-conversion-funnel.md) | Pending |
| 5 | [Phase 5: Open-Source Growth Engine and CI Governance (Steps 21–25)](./phase-05-open-source-growth-engine-and-ci-governance.md) | Pending |

## Success Criteria

- [ ] `LICENSE` (Apache-2.0) and `src/ee/LICENSE-COMMERCIAL.md` committed; `.gitignore` and `.npmignore` exclude `.claude/`, `.agentkit/`, `.wrangler/`, and secrets.
- [ ] Pure OSS core (`src/tree/**`) has zero imports from `src/ee/**` enforced by automated architectural test.
- [ ] `src/ee/` implements 4-tier SaaS entitlement checks (`BASIC | PREMIUM | ENTERPRISE | MASTER`), NOWPayments IPN webhook verification, and Local-to-Cloud bot sync.
- [ ] All existing 5,903+ tests plus new Open-Core/SaaS boundary tests pass with 0 TypeScript/ESLint errors and < 200 LOC per file.

<!-- slug: open-core-public-github-and-cloud-saas-25-step-restructuring -->
