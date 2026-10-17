# Phase 02 — D1 SaaS Entitlement & NOWPayments IPN Store (Seam G2)

## Context Links
- Migration: `migrations/0013_saas_entitlements.sql`
- Target Files:
  - `src/ee/billing/saas-entitlement-store.ts` (New, `< 160 LOC`)
  - `src/app/api/ee/billing/nowpayments-ipn/route.ts`

## Overview
- **Priority:** P1
- **Status:** Pending
- **Description:** Build a dual-mode (Cloudflare D1 + deterministic in-memory fallback) persistence store for `saas_workspace_entitlements` and `saas_nowpayments_ipn_events`, and wire `POST /api/ee/billing/nowpayments-ipn` to persist verified IPN events and upgrade workspace tiers.

## Requirements
- `SaasEntitlementStore` supports:
  - `hasProcessedPayment(paymentId: string): Promise<boolean>`
  - `recordIpnAndUpgradeTier(record: IpnActivationRecord): Promise<void>`
  - `getWorkspaceTier(workspaceId: string): Promise<SaasTier>`
- Uses Cloudflare D1 (`saas_nowpayments_ipn_events` and `saas_workspace_entitlements` from `migrations/0013_saas_entitlements.sql`) when a `D1Database` binding is injected, and seamlessly falls back to an in-memory store when running in unit tests or local OSS mode without D1.
- Strictly `< 200 LOC`, zero `:any`.

## Implementation Steps
1. Create `src/ee/billing/saas-entitlement-store.ts` implementing D1 prepared statements for `saas_nowpayments_ipn_events` and `saas_workspace_entitlements` with in-memory fallback.
2. Wire `src/app/api/ee/billing/nowpayments-ipn/route.ts` and `src/app/api/ee/billing/ipn/route.ts` to use the singleton `defaultSaasEntitlementStore`.
3. Expose `GET /api/ee/billing/nowpayments-ipn?workspaceId=...` (or workspace tier lookup) so callers can inspect the workspace's activated tier.

## Todo List
- [ ] Create `src/ee/billing/saas-entitlement-store.ts`
- [ ] Wire `src/app/api/ee/billing/nowpayments-ipn/route.ts` to `defaultSaasEntitlementStore`
- [ ] Add unit tests for D1 + fallback persistence
