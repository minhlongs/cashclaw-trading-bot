# Phase 03 — Cloud Alpha Feed, Signed Alerts API & Cron Lease (Seams G4 + G5)

## Context Links
- Step 12 Module: `src/ee/scheduler/cloud-scheduler-coordinator.ts`
- Step 14 Module: `src/ee/alpha-cloud/alpha-feed-service.ts`
- Step 15 Module: `src/ee/alerts/cloud-alert-dispatcher.ts`
- Cron Worker: `src/worker-cron.ts`

## Overview
- **Priority:** P1
- **Status:** Pending
- **Description:** Expose `GET /api/ee/alpha-feed` (Step 14) and `POST /api/ee/alerts` (Step 15) as Next.js App Router API routes, and wire `CloudSchedulerCoordinator` into `src/worker-cron.ts` (Step 12) for isolate-level tick lease deduplication.

## Requirements
- `GET /api/ee/alpha-feed` accepts `?tier=BASIC|PREMIUM|ENTERPRISE|MASTER` (or `x-cashclaw-tier` header, or resolves workspace tier from `defaultSaasEntitlementStore` via `?workspaceId=`), returning tier-filtered curated alpha items with `safetyMode: 'PAPER_ADVISORY_ONLY'`.
- `POST /api/ee/alerts` validates a `CloudAlertEvent` with Zod, checks `CloudAlertDeduplicator`, signs the payload via `signAlertWebhookPayload`, and returns `{ ok: true, dispatched, envelope }`.
- `src/worker-cron.ts` acquires a cron tick lease via `CloudSchedulerCoordinator` when `env.EDITION_MODE === 'CLOUD_SAAS'` or when `scheduledTime` is provided, preventing duplicate tick execution for the same epoch minute on the same isolate instance while keeping existing `worker.test.ts` behavior intact.

## Todo List
- [ ] Create `src/app/api/ee/alpha-feed/route.ts`
- [ ] Create `src/app/api/ee/alerts/route.ts`
- [ ] Integrate `CloudSchedulerCoordinator` into `src/worker-cron.ts`
