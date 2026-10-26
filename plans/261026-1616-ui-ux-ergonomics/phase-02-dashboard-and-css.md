# Phase 2 — Pillar 2: Dashboard View Mode Tabs, CSS 44px & Layout Padding Cleanup

## Context
- `src/components/dashboard/dashboard-client.tsx` (92 LOC) renders 9 sections vertically with no view mode filtering.
- `.main-content` is nested twice on child dashboard pages (`bots/page.tsx`, `bots/new/page.tsx`, `bots/[id]/page.tsx`, `bots/[id]/page-client.tsx`, `settings/page.tsx`) and `.dashboard` adds another `padding: var(--space-6)`.
- `.form-input` is declared multiple times in `src/app/globals.css` with conflicting `height: 36px` and `padding: 8px`.

## Files Owned
- `src/components/dashboard/dashboard-view-tabs.tsx` (New)
- `src/components/dashboard/dashboard-client.tsx`
- `src/components/dashboard/dashboard-data-mapper.ts`
- `src/components/dashboard/__tests__/dashboard-data.test.tsx`
- `src/app/globals.css`
- `src/app/[locale]/(dashboard)/bots/page.tsx`
- `src/app/[locale]/(dashboard)/bots/new/page.tsx`
- `src/app/[locale]/(dashboard)/bots/[id]/page.tsx`
- `src/app/[locale]/(dashboard)/bots/[id]/page-client.tsx`
- `src/app/[locale]/(dashboard)/settings/page.tsx`

## Implementation Steps
1. Create `src/components/dashboard/dashboard-view-tabs.tsx` (`<= 65 LOC`) implementing WAI-ARIA `role="tablist"`, `role="tab"`, `aria-selected`, and roving `tabIndex` with `ArrowLeft`/`ArrowRight`/`Home`/`End` support for `ALL`, `TRADING`, and `TELEMETRY`.
2. Update `src/components/dashboard/dashboard-client.tsx` (`<= 90 LOC`) to integrate `DashboardViewTabs` (default `ALL`), keeping `DashboardTopKpiCards` anchored at top and toggling `.hidden` class on child sections.
3. Update `src/components/dashboard/dashboard-data-mapper.ts` to include `live_running` and `paper_test` in `activeBots`.
4. Clean up `src/app/globals.css`: unify `.form-input` to `min-height: var(--target-min-height); height: 44px;`, remove `.dashboard` redundant padding, add `.hidden { display: none !important; }`, and add styles for `.sidebar-group-label`, `.sidebar-paper-badge`, and `.dashboard-tabs`.
5. Remove redundant `<div className="main-content">` wrappers in `bots/page.tsx`, `bots/new/page.tsx`, `bots/[id]/page.tsx`, `bots/[id]/page-client.tsx`, and `settings/page.tsx`.
