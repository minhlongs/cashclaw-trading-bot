---
phase: 4
title: "Phase 4: SaaS Billing Quotas and Conversion Funnel (Steps 16–20)"
status: completed
priority: P1
effort: "1d"
dependencies: [2, 3]
---

# Phase 4: SaaS Billing Quotas and Conversion Funnel (Steps 16–20)

## Overview
Implement the monetization engine in `src/ee/billing/`: canonical 4-tier SaaS entitlement matrix (`BASIC | PREMIUM | ENTERPRISE | MASTER`), fail-closed quota guard, NOWPayments IPN crypto webhook verifier (strictly avoiding Polar per handover rules), BYOK vs. Managed Key router, and the 1-click Local-to-Cloud Bot Sync Bridge.

## Requirements
- **Functional:**
  - Step 16: Define canonical SaaS Tier Entitlements (`BASIC | PREMIUM | ENTERPRISE | MASTER`) and D1 migration `migrations/0013_saas_entitlements.sql` for subscription state and usage counters.
  - Step 17: Implement `src/ee/billing/quota-guard.ts` checking active bot count, backtest window bars, and LLM deliberation credits against the user's tier, returning structured upgrade metadata when exceeded.
  - Step 18: Implement `src/ee/billing/nowpayments-ipn.ts` using WebCrypto HMAC-SHA512 (`crypto.subtle`) to verify NOWPayments IPN webhooks and map payment status (`finished`/`confirmed`) to tier activation.
  - Step 19: Implement `src/ee/billing/key-mode-router.ts` routing requests between `BYOK` (self-hosted / `BASIC`) and `MANAGED_CLOUD` (`PREMIUM | ENTERPRISE | MASTER`).
  - Step 20: Implement `src/ee/sync/local-to-cloud-sync.ts` validating and importing a self-hosted paper bot configuration + hypothesis lineage bundle into CashClaw Cloud SaaS.
- **Non-functional:**
  - WebCrypto only (`crypto.subtle`), canonical uppercase tier enum (`BASIC | PREMIUM | ENTERPRISE | MASTER`), zero Polar references, < 200 LOC per file.

## Architecture
```
migrations/
└── 0013_saas_entitlements.sql          # Step 16: D1 user_entitlements & billing_events tables
src/ee/
├── billing/
│   ├── tier-entitlements.ts            # Step 16: Canonical BASIC/PREMIUM/ENTERPRISE/MASTER matrix
│   ├── quota-guard.ts                  # Step 17: Fail-closed quota enforcement + upgrade CTA
│   ├── nowpayments-ipn.ts              # Step 18: HMAC-SHA512 NOWPayments IPN webhook verifier
│   └── key-mode-router.ts              # Step 19: BYOK vs Managed Cloud credential resolver
└── sync/
    └── local-to-cloud-sync.ts          # Step 20: 1-click OSS local bot -> Cloud 24/7 migration
```

## Related Code Files
- Create: `migrations/0013_saas_entitlements.sql`
- Create: `src/ee/billing/tier-entitlements.ts`
- Create: `src/ee/billing/quota-guard.ts`
- Create: `src/ee/billing/nowpayments-ipn.ts`
- Create: `src/ee/billing/key-mode-router.ts`
- Create: `src/ee/sync/local-to-cloud-sync.ts`
- Create: `src/ee/__tests__/saas-billing-and-sync.test.ts`

## Implementation Steps
1. **Step 16 (`tier-entitlements.ts` & `0013_saas_entitlements.sql`):** Define Zod-validated `SaasTier` (`BASIC | PREMIUM | ENTERPRISE | MASTER`) limits (bots, bars, LLM credits, alerts, retention) and SQLite/D1 tables `user_subscriptions` and `billing_ipn_log`.
2. **Step 17 (`quota-guard.ts`):** Implement `evaluateQuotaGate` returning `Result<QuotaApproved, QuotaExceededError>` with recommended target tier and bilingual upgrade reason.
3. **Step 18 (`nowpayments-ipn.ts`):** Sort IPN payload keys alphabetically, compute HMAC-SHA512 via `crypto.subtle`, compare timing-safely, and emit deterministic tier upgrade transition.
4. **Step 19 (`key-mode-router.ts`):** Resolve whether an LLM or market-data call uses user-supplied encrypted keys (`BYOK`) or platform-managed pool (`MANAGED_CLOUD`).
5. **Step 20 (`local-to-cloud-sync.ts`):** Validate exported local paper bot JSON with Zod, enforce ADR-001 `mode: 'paper'`, verify target tenant quota, and generate a deterministic cloud bot hydration record.

## Todo
- [x] Step 16: Create `src/ee/billing/tier-entitlements.ts` and `migrations/0013_saas_entitlements.sql`
- [x] Step 17: Create `src/ee/billing/quota-guard.ts`
- [x] Step 18: Create `src/ee/billing/nowpayments-ipn.ts`
- [x] Step 19: Create `src/ee/billing/key-mode-router.ts`
- [x] Step 20: Create `src/ee/sync/local-to-cloud-sync.ts` and `saas-billing-and-sync.test.ts`

## Success Criteria
- [x] NOWPayments IPN signature verification passes deterministic positive and tamper-rejection test vectors.
- [x] Quota guard deterministically blocks over-limit requests on `BASIC` and permits them on `PREMIUM`/`ENTERPRISE`/`MASTER`.
- [x] Local-to-Cloud sync rejects any payload attempting `live` trading mode (ADR-001).

## Risk Assessment
- **Risk:** Webhook replay or signature forgery activates unpaid tiers.
- **Mitigation:** Strict sorted-JSON HMAC-SHA512 verification + idempotent `payment_id` check in `nowpayments-ipn.ts`.
