---
title: "End-to-End Smoke Test: Verify Full Customer Journey"
description: "Verify all 6 customer journey flows work end-to-end, fix schema mismatches and broken wiring"
status: pending
priority: P1
effort: 5h
branch: main
tags: [smoke-test, e2e, bug-fix, customer-journey]
created: 2026-08-15
---

## Context

The customer journey has 6 flows that must work end-to-end. Code review during planning revealed **5 critical bugs** that will break flows 1, 3, 4, and 5. This plan fixes all broken flows and adds integration tests to prevent regressions.

## Critical Bugs Found (blocking flows)

### BUG-1: Settings API Schema Mismatch (Breaks Flow 4: Settings Save)
**Files:**
- `src/components/settings/settings-client.tsx:54,82,103,126` — sends `{ action: 'save-exchange', ... }` and `{ action: 'save-risk', ... }`
- `src/app/api/settings/route.ts:11-33` — expects `{ type: 'exchange', ... }` and `{ type: 'risk', ... }`

**Impact:** All settings saves (exchange creds, risk limits, killswitch) fail silently with `400 Invalid input`.

**Fix:** Update settings-client.tsx to send `{ type: 'exchange', ... }`, `{ type: 'risk', ... }`, `{ type: 'killswitch', action: 'halt' }`, `{ type: 'killswitch', action: 'resume' }`.

### BUG-2: Bot Creation Missing `id` Field (Breaks Flow 3: Create Bot)
**Files:**
- `src/components/bots/bot-wizard-client.tsx:60-68` — sends body without `id`
- `src/app/api/bots/route.ts:12` — schema requires `id: z.string().min(1).max(64)`

**Impact:** Bot creation fails with `400 id: Required`.

**Fix:** Generate UUID in bot wizard before submit: `id: crypto.randomUUID()`.

### BUG-3: Missing Locale Prefix in Links (Breaks Flow 3: Navigation)
**Files:**
- `src/components/dashboard/dashboard-client.tsx:170,224` — links to `/bots/new`
- `src/components/bots/bot-wizard-client.tsx:74` — redirects to `/bots/${id}`

**Impact:** Links navigate to `/bots/new` instead of `/vi/bots/new`. On production with locale routing, this hits 404 or wrong locale.

**Fix:** Use `useLocale()` hook and prefix all navigation with `/${locale}/`.

### BUG-4: Double `app-container` Wrapper (Breaks Flow 2: Dashboard Layout)
**Files:**
- `src/app/[locale]/(dashboard)/dashboard/page.tsx:14` — wraps in `app-container`
- `src/app/[locale]/(dashboard)/layout.tsx:10` — already wraps children in `app-container` with Sidebar + MobileNav

**Impact:** Dashboard renders nested flex containers, breaking layout. Sidebar appears twice or content is misaligned.

**Fix:** Remove `<div className="app-container">` from dashboard/page.tsx, keep only `<DashboardClient />`.

### BUG-5: Settings Page Missing Dashboard Layout (Breaks Flow 4: Settings)
**Files:**
- `src/app/[locale]/settings/page.tsx` — not under `(dashboard)/` route group
- `src/app/[locale]/bots/new/page.tsx` — not under `(dashboard)/` route group

**Impact:** Settings and Bot Wizard pages render without Sidebar/MobileNav layout. Users can't navigate back to dashboard.

**Fix:** Move settings and bot pages under `(dashboard)/` route group, or create separate layouts.

### BUG-6: Killswitch Boolean Semantics Inverted (Breaks Flow 5: Killswitch)
**Control-flow trace:**
1. `src/tree/bot/killswitch.ts:151` — `isTradingEnabled()` returns `true` when trading is **allowed**
2. `src/forest/settings/actions.ts:139` — `data.killswitch.enabled = ks.isTradingEnabled()`, so `enabled` means **"trading is on"**
3. `src/components/settings/settings-client.tsx:191` — renders `settings.killswitch.enabled ? 'HALTED' : 'ACTIVE'` — treats `enabled` as **"killswitch engaged"**

**Impact — three distinct failures:**
- Badge shows `HALTED` when trading is actually running, `ACTIVE` when halted (inverted display)
- `settings-client.tsx:203` — Halt button is `disabled={ksSaving || settings.killswitch.enabled}`. Since `enabled=true` means trading is on, **the Halt button is permanently disabled exactly when you need it**. Flow 5 cannot be executed from the UI.
- `settings-client.tsx:107,130` — optimistic updates set `enabled: true` after halt and `enabled: false` after resume, matching the UI's (wrong) meaning. State appears correct until reload, then flips.

Backend halt/resume themselves are consistent: `actions.ts:230` sets `enabled = false` on halt, `actions.ts:244` sets `enabled = true` on resume — both matching the "trading enabled" meaning.

**Fix:** Pick one meaning and apply it everywhere. Recommend keeping the backend meaning (`enabled` = trading enabled) since `isTradingEnabled()` is the source of truth and 3 backend sites already agree, then fix the 4 client sites:
- Line 191: `settings.killswitch.enabled ? 'ACTIVE' : 'HALTED'` and swap the badge class
- Line 203: `disabled={ksSaving || !settings.killswitch.enabled}`
- Line 107: optimistic halt sets `enabled: false`
- Line 130: optimistic resume sets `enabled: true`
- Also add `disabled={ksSaving || settings.killswitch.enabled}` to the Resume button (currently always enabled)

**Naming note:** `enabled` is ambiguous and caused this bug. Consider renaming to `tradingEnabled` in `SettingsData` to make the meaning unmistakable — but this touches the D1 row mapping at `actions.ts:99-104,156`, so treat as optional follow-up, not part of the fix.

---

## Plan Phases

### Phase 1: Fix Settings API Schema Mismatch (1h)
**Priority:** P1 — blocks Flow 4
**Owner:** fullstack-developer

**Changes:**
1. Edit `src/components/settings/settings-client.tsx`:
   - Line 54: Change `{ action: 'save-exchange', exchange, data: { apiKey, apiSecret, testnet } }` to `{ type: 'exchange', exchange, apiKey, apiSecret, testnet }`
   - Line 82: Change `{ action: 'save-risk', data: { risk } }` to `{ type: 'risk', ...risk }`
   - Line 103: Change `{ action: 'halt' }` to `{ type: 'killswitch', action: 'halt' }`
   - Line 126: Change `{ action: 'resume' }` to `{ type: 'killswitch', action: 'resume' }`

2. Add integration test in `src/forest/settings/actions.test.ts`:
   - Test exchange save round-trip (POST → GET → verify persistence)
   - Test risk limits save round-trip
   - Test killswitch halt/resume cycle

**Success Criteria:**
- `npm run type-check` passes
- Settings save returns `{ ok: true }` for exchange, risk, killswitch
- Settings GET reflects saved values

**Rollback:** Revert settings-client.tsx changes.

---

### Phase 2: Fix Bot Creation Missing ID (30min)
**Priority:** P1 — blocks Flow 3
**Owner:** fullstack-developer

**Changes:**
1. Edit `src/components/bots/bot-wizard-client.tsx`:
   - Line 60: Add `id: crypto.randomUUID()` to request body

2. Verify `src/app/api/bots/route.ts:12` schema accepts UUID format (already does — `z.string().min(1).max(64)`)

**Success Criteria:**
- Bot creation succeeds and returns `{ ok: true, data: { id: "..." } }`
- Bot appears in dashboard bot list
- No TypeScript errors

**Rollback:** Remove `id` field from request body.

---

### Phase 3: Fix Missing Locale Prefix in Links (30min)
**Priority:** P1 — breaks navigation
**Owner:** fullstack-developer

**Changes:**
1. Edit `src/components/dashboard/dashboard-client.tsx`:
   - Add `import { useLocale } from 'next-intl'`
   - Add `const locale = useLocale()`
   - Line 170: Change `href="/bots/new"` to `href={`/${locale}/bots/new`}`
   - Line 224: Change `href="/bots/new"` to `href={`/${locale}/bots/new`}`

2. Edit `src/components/bots/bot-wizard-client.tsx`:
   - Add `import { useLocale } from 'next-intl'`
   - Add `const locale = useLocale()`
   - Line 74: Change `router.push(`/bots/${data.data?.id}`)` to `router.push(`/${locale}/bots/${data.data?.id}`)`

**Success Criteria:**
- All navigation links include locale prefix
- Links work correctly on both `/vi/` and `/en/` locales

**Rollback:** Remove locale prefix from links.

---

### Phase 4: Fix Dashboard Double Wrapper (30min)
**Priority:** P1 — breaks layout
**Owner:** fullstack-developer

**Changes:**
1. Edit `src/app/[locale]/(dashboard)/dashboard/page.tsx`:
   - Remove `<div className="app-container">` wrapper
   - Change to: `<DashboardClient />`

**Success Criteria:**
- Dashboard renders with single sidebar + content layout
- No nested flex containers
- Mobile nav appears correctly on small screens

**Rollback:** Re-add `<div className="app-container">` wrapper.

---

### Phase 5: Fix Route Group for Settings and Bot Pages (1h)
**Priority:** P1 — breaks layout for settings/bots
**Owner:** fullstack-developer

**Changes:**
1. Move `src/app/[locale]/settings/page.tsx` to `src/app/[locale]/(dashboard)/settings/page.tsx`
2. Move `src/app/[locale]/bots/` directory to `src/app/[locale]/(dashboard)/bots/`
3. Verify no other files reference the old paths

**Success Criteria:**
- Settings page renders with sidebar + mobile nav
- Bot pages render with sidebar + mobile nav
- All navigation works correctly

**Rollback:** Move files back to original locations.

---

### Phase 6: Fix Killswitch Boolean Semantics (30min)
**Priority:** P1 — blocks Flow 5
**Owner:** fullstack-developer

**Changes:**
1. Edit `src/components/settings/settings-client.tsx`:
   - Line 191: Change `settings.killswitch.enabled ? 'HALTED' : 'ACTIVE'` to `settings.killswitch.enabled ? 'ACTIVE' : 'HALTED'`
   - Line 189: Change `badge-error` when enabled to `badge-neutral` when enabled (swap classes)
   - Line 203: Change `disabled={ksSaving || settings.killswitch.enabled}` to `disabled={ksSaving || !settings.killswitch.enabled}`
   - Add `disabled={ksSaving || settings.killswitch.enabled}` to Resume button (line 215)
   - Line 107: Change `enabled: true` to `enabled: false` in optimistic halt update
   - Line 130: Change `enabled: false` to `enabled: true` in optimistic resume update

**Success Criteria:**
- Halt button is enabled when trading is active, disabled when halted
- Resume button is enabled when halted, disabled when active
- Badge shows correct state
- Killswitch cycle works end-to-end

**Rollback:** Revert all changes to settings-client.tsx.

---

### Phase 7: Add Integration Tests (1h)
**Priority:** P2 — prevents regressions
**Owner:** tester

**Changes:**
1. Create `src/__tests__/e2e-smoke.test.ts`:
   - Test login flow (POST /api/auth/login → verify session cookie)
   - Test bot creation flow (POST /api/bots → verify bot appears in list)
   - Test settings save flow (POST /api/settings → GET /api/settings → verify persistence)
   - Test killswitch flow (halt → resume → verify state; assert `enabled` toggles correctly)
   - Verify no TypeScript errors in all modified files

**Success Criteria:**
- All integration tests pass
- `npm test` passes
- No regressions in existing tests

**Rollback:** Delete test file.

---

## Test Matrix

| Flow | Unit Test | Integration Test | Manual Test |
|------|-----------|------------------|-------------|
| 1. Login | N/A (existing) | ✅ New | ✅ |
| 2. Dashboard | N/A (existing) | ✅ New | ✅ |
| 3. Create Bot | N/A (existing) | ✅ New | ✅ |
| 4. Settings Save | ✅ Existing | ✅ New | ✅ |
| 5. Killswitch | ✅ Existing | ✅ New | ✅ |
| 6. Mobile Responsive | N/A | N/A | ✅ |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Settings schema fix breaks other callers | Low | High | Grep for all callers, verify only settings-client.tsx uses this API |
| Route group move breaks imports | Medium | High | Run `npm run type-check` after each move |
| Bot ID generation fails in browser | Low | Medium | `crypto.randomUUID()` available in all modern browsers + CF Workers |
| Existing tests break | Low | High | Run full test suite after each phase |

## Backwards Compatibility

- Settings API schema change is **breaking** — but the old schema never worked (always returned 400), so no existing callers depend on it
- Bot ID generation is additive — no existing code depends on bot ID being auto-generated server-side
- Locale prefix is additive — links work with or without prefix, but prefix is required for correct routing

## Rollback Plan

Each phase is independently revertible:
1. Settings fix: Revert settings-client.tsx
2. Bot ID fix: Remove `id` field from request body
3. Locale prefix: Remove locale from links
4. Dashboard wrapper: Re-add wrapper div
5. Route groups: Move files back
6. Tests: Delete test file

## Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `src/components/settings/settings-client.tsx` | 1, 6 | Fix API request body schema + killswitch boolean semantics |
| `src/components/bots/bot-wizard-client.tsx` | 2, 3 | Add `id` field, add locale prefix |
| `src/components/dashboard/dashboard-client.tsx` | 3 | Add locale prefix to links |
| `src/app/[locale]/(dashboard)/dashboard/page.tsx` | 4 | Remove double wrapper |
| `src/app/[locale]/settings/page.tsx` | 5 | Move to (dashboard)/ route group |
| `src/app/[locale]/bots/` | 5 | Move to (dashboard)/ route group |
| `src/__tests__/e2e-smoke.test.ts` | 7 | New integration tests |

## Unresolved Questions

1. Should we add server-side session validation to GET /api/bots and GET /api/settings? Currently they're public (no auth check). This is a security concern but not blocking the smoke test.
2. Should we add locale-aware redirect after login? Currently login redirects to `/${locale}/dashboard` which is correct, but the login page itself is under `(auth)` route group without dashboard layout.
3. Should we add error boundaries for each flow? Currently errors are handled inline, but a global error boundary would improve UX.
4. **Killswitch naming (BUG-6):** `enabled` in `SettingsData` means "trading is on" but reads like "killswitch is engaged". Consider renaming to `tradingEnabled` for clarity. This touches `SettingsRow` in `src/lib/db/repositories.ts` and `persistSettings()` in `src/forest/settings/actions.ts:156-158`. Recommend as follow-up, not part of the fix (risk > value in this plan).
