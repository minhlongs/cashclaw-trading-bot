---
phase: 3
title: "Phase 3: SaaS Value Moat and Cloud-Only Architecture (Steps 11–15)"
status: completed
priority: P1
effort: "1.5d"
dependencies: [1, 2]
---

# Phase 3: SaaS Value Moat and Cloud-Only Architecture (Steps 11–15)

## Overview
Construct the proprietary `src/ee/` Cloud SaaS value moat so users have a compelling economic reason to subscribe to CashClaw Cloud instead of only self-hosting: multi-tenant workspace isolation, 24/7 durable cloud cron orchestration, managed LLM deliberation token metering, Cloud Alpha Intelligence feed, and real-time multi-channel alerting.

## Requirements
- **Functional:**
  - Step 11: Multi-tenant workspace & anti-IDOR policy engine (`src/ee/tenancy/tenant-policy.ts`) enforcing organization/user isolation and concurrent bot limits.
  - Step 12: 24/7 Cloud Durable Scheduler coordinator (`src/ee/scheduler/cloud-scheduler-coordinator.ts`) prioritizing paid tiers (`MASTER` > `ENTERPRISE` > `PREMIUM` > `BASIC`) with automatic provider failover provenance.
  - Step 13: Managed TradingAgents LLM Credit Ledger (`src/ee/deliberation-cloud/llm-credit-ledger.ts`) metering FAST/REASONING multi-agent debates against subscription credits (while allowing BYOK fallback for OSS).
  - Step 14: Cloud Alpha Intelligence Feed synthesizer (`src/ee/alpha-cloud/alpha-feed-service.ts`) delivering gated live IC/IR leaderboards and regime-shift warnings to paid tiers (`PREMIUM+`).
  - Step 15: Multi-Channel Cloud Alert Dispatcher contract (`src/ee/alerts/cloud-alert-dispatcher.ts`) formatting Telegram (`@Sophia_Bbot` compatible) and Webhook paper-signal notifications.
- **Non-functional:**
  - Strictly paper/backtest advisory (ADR-001), zero `:any`, each file < 200 LOC, deterministic unit tests.

## Architecture
```
src/ee/
├── LICENSE-COMMERCIAL.md
├── tenancy/
│   └── tenant-policy.ts                # Step 11: Multi-tenant isolation & seat/bot limits
├── scheduler/
│   └── cloud-scheduler-coordinator.ts  # Step 12: 24/7 priority queue for Cloud cron ticks
├── deliberation-cloud/
│   └── llm-credit-ledger.ts            # Step 13: Managed LLM debate credit metering
├── alpha-cloud/
│   └── alpha-feed-service.ts           # Step 14: Tier-gated Alpha IC/IR & regime radar
└── alerts/
    └── cloud-alert-dispatcher.ts       # Step 15: Telegram/Webhook paper signal alerts
```

## Related Code Files
- Create: `src/ee/tenancy/tenant-policy.ts`
- Create: `src/ee/scheduler/cloud-scheduler-coordinator.ts`
- Create: `src/ee/deliberation-cloud/llm-credit-ledger.ts`
- Create: `src/ee/alpha-cloud/alpha-feed-service.ts`
- Create: `src/ee/alerts/cloud-alert-dispatcher.ts`
- Create: `src/ee/__tests__/saas-value-moat.test.ts`

## Implementation Steps
1. **Step 11 (`tenant-policy.ts`):** Define `TenantContext` and `assertTenantOwnership` + tier-based seat & workspace isolation checks.
2. **Step 12 (`cloud-scheduler-coordinator.ts`):** Build deterministic tick batch planner sorting active cloud bots by tier priority and enforcing tick cadence (e.g., 60s for `BASIC`, 10s for `PREMIUM`/`ENTERPRISE`/`MASTER`).
3. **Step 13 (`llm-credit-ledger.ts`):** Calculate token/credit consumption per Bull/Bear/Risk deliberation round and determine whether to route via Managed Cloud Keys or user BYOK.
4. **Step 14 (`alpha-feed-service.ts`):** Filter Alpha Zoo leaderboard entries: `BASIC`/OSS sees delayed seed summaries, `PREMIUM`/`ENTERPRISE`/`MASTER` unlocks full rolling IC/IR, quantile spread, and regime radar.
5. **Step 15 (`cloud-alert-dispatcher.ts`):** Build bilingual (`vi`/`en`) alert payloads for paper trade fills, killswitch halts, and drawdown alerts with HMAC signature headers.

## Todo
- [x] Step 11: Implement `src/ee/tenancy/tenant-policy.ts`
- [x] Step 12: Implement `src/ee/scheduler/cloud-scheduler-coordinator.ts`
- [x] Step 13: Implement `src/ee/deliberation-cloud/llm-credit-ledger.ts`
- [x] Step 14: Implement `src/ee/alpha-cloud/alpha-feed-service.ts`
- [x] Step 15: Implement `src/ee/alerts/cloud-alert-dispatcher.ts` and `saas-value-moat.test.ts`

## Success Criteria
- [x] All 5 `src/ee/` value-moat modules compile cleanly with 0 `:any` types and < 200 LOC each.
- [x] `src/ee/__tests__/saas-value-moat.test.ts` verifies tier prioritization, credit deduction, alpha feed redaction for unpaid tiers, and bilingual alert formatting.

## Risk Assessment
- **Risk:** Paid cloud features accidentally block local single-user backtesting.
- **Mitigation:** `src/ee/` services only gate hosted cloud resources (24/7 cron, managed LLM credits, live cloud alpha feed); local CPU backtesting in `src/tree/` remains 100% unrestricted.
