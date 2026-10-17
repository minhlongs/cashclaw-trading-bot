# Phase 01 — Quota & Sync Runtime Wiring (Seams G1 + G3)

## Context Links
- Brainstorm Report: `plans/reports/20261017-open-core-saas-25-steps-deep-introspection-report.md`
- Target Files:
  - `src/app/api/bots/route.ts`
  - `src/app/api/bots/route.test.ts`
  - `src/app/api/ee/sync/route.ts`

## Overview
- **Priority:** P1
- **Status:** Pending
- **Description:** Replace hardcoded `const currentBotCount = 0` in `POST /api/bots` with live bot count from `botListHandler()`, and wire `POST /api/ee/sync` to validate workspace quota (`enforceWorkspaceQuota`) before accepting a signed CLI sync bundle.

## Requirements
- `POST /api/bots` queries `botListHandler()` (falling back to `0` if mock/list returns undefined) to determine `activeRunningBots` before calling `enforceWorkspaceQuota()`.
- `POST /api/ee/sync` reads `x-cashclaw-tier` and optional `x-cashclaw-active-bots` (or queries `botListHandler()`) and enforces `enforceWorkspaceQuota()`, returning `403` when quota is exceeded.
- Existing tests in `src/app/api/bots/route.test.ts` and `src/ee/__tests__/saas-billing-and-sync.test.ts` continue to pass, plus new tests for `403 QUOTA_EXCEEDED`.

## Implementation Steps
1. Update `src/app/api/bots/route.ts` to call `await botListHandler()` and compute `currentBotCount = Array.isArray(listRes?.data) ? listRes.data.length : 0` (also supporting `listRes?.bots` for test mocks).
2. Update `src/app/api/ee/sync/route.ts` to enforce `enforceWorkspaceQuota` using `x-cashclaw-tier` (default `'BASIC'`) and active bot count.
3. Add test cases in `src/app/api/bots/route.test.ts` verifying that `BASIC` tier is blocked (`403`) when 1 bot already exists, while `PREMIUM` succeeds.

## Todo List
- [ ] Wire live bot count in `src/app/api/bots/route.ts`
- [ ] Wire quota check in `src/app/api/ee/sync/route.ts`
- [ ] Add quota enforcement test in `src/app/api/bots/route.test.ts`
