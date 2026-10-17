# Quad-Cluster Deep Refactor Wave 3 Plan

## Status: COMPLETE (2026-10-17) — 707/707 Test Files (6,000/6,000 Tests) Green, 0 Non-Test Files > 119 LOC

### Overview
Wave 3 deep refactoring targeting:
1. **Cluster A / Phase 01: SaaS EE Scheduler & Telemetry Unification + Quota/Tier Guard Hardening**
   - Export shared `defaultCloudSchedulerCoordinator` from `src/ee/scheduler/cloud-scheduler-coordinator.ts`.
   - Wire `src/worker-cron.ts` and `src/app/api/ee/scheduler/route.ts` to `defaultCloudSchedulerCoordinator`.
   - Add `GET /api/ee/scheduler` returning `activeLeaseCount` and lease status.
   - Export `defaultFunnelSink` from `src/ee/telemetry/conversion-funnel.ts`, use it in `src/app/api/ee/telemetry/route.ts`, and add `GET /api/ee/telemetry` returning `summarizeFunnel(defaultFunnelSink)`.
   - Add tier check on `POST /api/ee/alerts` via `resolveWorkspaceTierContext` + `getEntitlementsForTier(tier).webhookAlertsEnabled`.
   - Add tests to `src/app/api/ee/__tests__/ee-routes.test.ts`.

2. **Cluster B / Phase 02: Shared Quant Screen Header & Lower Non-Test Ceiling Across `src/` to `<= 120 LOC`**
   - Create `src/components/quant/quant-screen-header.tsx` (`< 50 LOC`) shared across all 12 quant screens.
   - Slim down all files currently between `121–131 LOC` so every non-test `.ts`/`.tsx` file in `src/` is strictly `<= 120 LOC`:
     - `src/components/strategies/volatility-dca-visualizer.tsx` (131 -> <= 115)
     - `src/components/settings/settings-client.tsx` (129 -> <= 115 via helper extraction)
     - `src/components/quant/regime-attribution-simulator.tsx` (129 -> <= 115)
     - `src/components/quant/data-quality-gate-inspector.tsx` (129 -> <= 115)
     - `src/components/quant/relative-value-basis-monitor.tsx` (125 -> <= 115)
     - `src/components/quant/survival-gate-monitor.tsx` (124 -> <= 115)
     - `src/components/bots/bot-detail-config.tsx` (124 -> <= 115)
     - `src/components/bots/sortable-table.tsx` (123 -> <= 115)
     - `src/components/quant/sovereign-enclave-attestation.tsx` (122 -> <= 115)
     - `src/components/quant/execution-ledger-simulator.tsx` (122 -> <= 115)
     - `src/lib/hooks/use-market-ticker.ts` (121 -> <= 115)
     - `src/forest/dashboard/quant-telemetry-service.ts` (121 -> <= 115)
     - `src/components/quant/fdr-multiple-testing-gate.tsx` (121 -> <= 115)
     - `src/components/quant/correlation-matrix-heatmap.tsx` (121 -> <= 115)
     - `src/components/billing/nowpayments-checkout-modal.tsx` (121 -> <= 115)

3. **Cluster C / Phase 03: Slice Next 4 Test Monoliths (`345–363 LOC`) Below `220 LOC`**
   - Slice `src/app/[locale]/(dashboard)/bots/[id]/page-client.test.tsx` (363 LOC) into:
     - `page-client.test.tsx` (< 200 LOC: rendering, tabs, error/loading states)
     - `page-client-actions.test.tsx` (< 200 LOC: start, stop, delete, edit handlers)
   - Slice `src/tree/exchange/rate-limiter/rate-limiter.test.ts` (356 LOC) into:
     - `rate-limiter.test.ts` (< 200 LOC: token bucket & sliding window core)
     - `rate-limiter-concurrency.test.ts` (< 200 LOC: multi-client burst, jitter & exhaustion)
   - Slice `src/tree/alpha/queue/queue.test.ts` (348 LOC) into:
     - `queue.test.ts` (< 200 LOC: enqueue, dequeue, status transition)
     - `queue-priority.test.ts` (< 200 LOC: priority reordering, batching & pruning)
   - Slice `src/tree/quantlib/functions.test.ts` (345 LOC) into:
     - `functions.test.ts` (< 200 LOC: core indicators & math)
     - `functions-strategies.test.ts` (< 200 LOC: strategy execution & edge cases)

4. **Phase 04: Quality Gates & Verification**
   - `npx tsc --noEmit` clean
   - `npx eslint src/` clean (0 warnings)
   - `npm test` 100% green
   - `npx tsx scripts/audit-oss-package.ts` 3/3 checks pass
