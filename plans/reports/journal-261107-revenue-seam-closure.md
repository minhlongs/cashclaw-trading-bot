# Revenue Seam Closure — Tier Authority, Workspace Identity & Real NOWPayments Checkout

## Objective
Close the four revenue seams in CashClaw's SaaS billing pipeline: eliminate client-supplied tier and active-bot-count overrides, bind workspaces to authenticated sessions via D1 membership, make missing `NOWPAYMENTS_IPN_SECRET` fail closed (`503 IPN_CONFIG_ERROR`), and replace the fake `setTimeout(600)` checkout modal with a real `POST /api/ee/billing/checkout` invoice endpoint backed by server-side `order_id` authority (`saas_checkout_orders`).

## Done means
- `?tier=`, `x-cashclaw-tier`, `alerts` body tier, `credits` query tier, and `x-cashclaw-active-bots` cannot influence tier or quota decisions (`0` occurrences of `explicitTier` in `src/`)
- `/api/ee/*` and `/api/ee/billing/checkout` require a valid session (`401`), while `/api/ee/billing/ipn` and `/api/ee/billing/nowpayments-ipn` stay public for NOWPayments webhooks
- `POST /api/ee/billing/checkout` computes price from `SAAS_TIER_ENTITLEMENTS`, rejects `BASIC` (`400`), fails closed with `503 PAYMENT_PROVIDER_UNAVAILABLE` when `NOWPAYMENTS_API_KEY` is unconfigured, and records `orderId -> (workspaceId, targetTier, expectedAmountUsd)` in `saas_checkout_orders` before returning
- Both IPN endpoints resolve `(workspaceId, targetTier)` from `CheckoutOrderStore.resolveTierDecision(order_id)` (returning `409 IPN_ORDER_UNKNOWN` on unissued orders) and ignore callback-declared `target_tier`/`workspace_id`; replays return `idempotentReplay: true`
- Missing `NOWPAYMENTS_IPN_SECRET` returns `503 IPN_CONFIG_ERROR` (`'test_ipn_secret'` fallback removed)
- Two distinct logged-in users resolve distinct workspaces and tiers from D1 (`ws_basic_local` BASIC vs `ws_master_local` MASTER)
- `npm run quality:gate` exits `0` (`731` test files / `6,133` tests pass, `93.76%` statement coverage, `0` warnings, `0` `:any`, Knip clean)

## What changed
1. **Tier Authority (`src/ee/tenancy/workspace-request-context.ts`, `alerts/route.ts`, `credits/route.ts`, `sync/route.ts`, `bots/route.ts`):** Removed all 4 self-declared tier inputs and the `x-cashclaw-active-bots` header bypass. Workspace tier now resolves exclusively from `defaultSaasEntitlementStore.getWorkspaceTier(workspaceId)`.
2. **Session-to-Workspace Identity (`src/middleware.ts`, `migrations/0015_saas_workspace_members.sql`, `src/ee/tenancy/workspace-membership.ts`, `src/ee/billing/saas-entitlement-store.ts`):** Added `/api/ee` to `PROTECTED_API_PREFIXES` and `SENSITIVE_GET_PREFIXES` while exempting only the two exact IPN webhook routes (`/api/ee/billing/ipn` and `/api/ee/billing/nowpayments-ipn`). Fixed a latent production bug where `defaultSaasEntitlementStore` was instantiated at module load with `this.db = undefined` and never called `createServerClient()` per request.
3. **Fail-Closed IPN Secret (`src/ee/billing/nowpayments-ipn-secret.ts`, `nowpayments-ipn-verifier.ts`, `nowpayments-ipn.ts`):** Deleted the `'test_ipn_secret'` fallback. `readIpnSecret()` reads `getCloudflareContext().env.NOWPAYMENTS_IPN_SECRET` first (falling back to `process.env` only outside a Worker request context) and returns `503 IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET` when absent.
4. **Checkout & Server-Side Order Authority (`migrations/0016_saas_checkout_orders.sql`, `src/ee/billing/checkout-order-store.ts`, `src/ee/billing/nowpayments-invoice-client.ts`, `src/app/api/ee/billing/checkout/route.ts`, `src/components/billing/nowpayments-checkout-modal.tsx`):** Created `POST /api/ee/billing/checkout` and `CheckoutOrderStore`. Both IPN routes now look up the server-issued order by `order_id` rather than trusting `workspace_id` or `target_tier` from the webhook body.

## The tricky bit
Two runtime traps only surfaced when exercising the built OpenNext bundle under `wrangler dev --port 8787`:
1. **Module-scope D1 singleton:** `defaultSaasEntitlementStore` and `defaultCheckoutOrderStore` are constructed at module evaluation time, when `getCloudflareContext()` throws because no request is active. Caching `this.db` once at construction silently degraded production to the in-memory Map (`BASIC` for every workspace). Resolving `createServerClient()` per call inside `resolveDb()` (while still honoring an injected test `db` when set) fixed both stores without breaking unit tests.
2. **Trust boundary on IPN payload fields:** HMAC-SHA512 signature verification proves NOWPayments sent the callback, not that custom fields (`workspace_id`, `target_tier`) in our local Zod schema came from NOWPayments. Making `saas_checkout_orders` the sole authority for `(workspaceId, targetTier)` keyed by `order_id` closed the gap: a signed IPN claiming `"target_tier":"MASTER"` against a `PREMIUM` order upgrades the workspace to `PREMIUM` and nothing higher.

## Deviations
D1 — Live network call to `https://api.nowpayments.io/v1/invoice` is gated on the merchant's `NOWPAYMENTS_API_KEY` secret, which is not yet provisioned in the environment. The worker's fail-closed `503 PAYMENT_PROVIDER_UNAVAILABLE` path and manual-payment fallback UI were verified live on `:8787`, and the `200` invoice creation path is pinned by 18 unit tests (`checkout/route.test.ts` + `nowpayments-invoice-client.test.ts`).
D2 — Remote production D1 (`--remote`) is currently at migration `0012` (missing `0013`–`0016`); per safety rules, no `--remote` schema mutations were executed without explicit user confirmation.

## Next
1. Provision `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` via `npx wrangler secret put` and apply migrations `0013`–`0016` to `--remote` D1 before production deploy.
2. Follow-up hardening (out of scope for this plan): remove `'default_alert_secret'` fallback in `src/app/api/ee/alerts/route.ts:70`.
