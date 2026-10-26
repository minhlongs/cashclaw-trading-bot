---
title: "UI/UX Ergonomics, WCAG 2.1 AA Accessibility & End-to-End QuantExecution Wiring"
description: "Implement the complete 3-Pillar UI/UX Ergonomics & Accessibility Upgrade for CashClaw Quant OS: 4-group semantic Sidebar with ADR-001 badge, Zero-CLS WAI-ARIA Dashboard View Mode Tabs, full bot wizard quantExecution end-to-end wiring, /bots status filter fix, and CSS 44px touch targets without double padding."
status: completed
priority: P1
effort: 3h
branch: feat/ui-ux-3pillar-ergonomics
tags: [ui-ux, accessibility, wcag, sidebar, dashboard, bot-wizard, quantlib, paper-only]
blockedBy: []
blocks: []
created: 2026-10-26
---

# Plan — UI/UX Ergonomics, WCAG 2.1 AA & QuantExecution Wiring

## Context & Objectives
Based on the verified Best-of-5 consensus report (`plans/reports/advise-261026-1605-ui-ux.md`), CashClaw Quant OS requires a comprehensive, non-breaking upgrade across 3 core pillars while maintaining the strict `ADR-001 PAPER_ONLY` invariant, zero `:any` types, zero `console.log`, and keeping all production files in `src/` `<= 92 LOC`.

### Pillar 1: Sidebar 4-Group Architecture & ADR-001 Safety Badge
- Partition 28 routes across 4 semantic groups (`Trading Core`, `Alpha Research & Gates`, `QuantLib & Microstructure`, `System & Governance`), surfacing missing `/billing` and `/strategies/volatility-dca`.
- Keep single-button constraint in `Sidebar` (`sidebar.test.tsx` compatibility) using `<div className="sidebar-group-label" role="presentation">` for group headers.
- Replace static `Loading...` footer text with `ADR-001 PAPER ONLY` terminal badge.
- Modularize routes into `src/components/layout/sidebar-routes.ts` (`<= 85 LOC`).

### Pillar 2: Dashboard Cognitive Declutter & Zero-CLS View Mode Tabs
- Create `src/components/dashboard/dashboard-view-tabs.tsx` with WAI-ARIA `role="tablist"`, roving `tabIndex`, and arrow key navigation.
- Modes: `ALL` (default, all 9 sections), `TRADING` (6 execution cards), `TELEMETRY` (4 institutional gauges).
- Keep `DashboardTopKpiCards` permanently visible at top as visual anchor.
- Toggle visibility using `.hidden` class to ensure 0 layout shift (CLS = 0) and zero network refetches.
- Update `mapBotsPayloadToDashboardData` to accurately count `live_running` and `paper_test` in `activeBots`.

### Pillar 3: Bot Wizard Ergonomics, QuantExecution Wiring & CSS Standard
- Expose `quantExecution` checkbox in `config-step.tsx` for `volatility_dca`, add to `VOLATILITY_DCA_DEFAULTS`, `VOLATILITY_DCA_FIELDS`, and fix `ReviewStep` branch for `volatility_dca`.
- Fix `FIELD_KEY_MAP` alias mapping for `rsi_buy` and `rsi_sell`.
- Add `quantExecution` to API Zod schema (`src/app/api/bots/route.ts`), normalizer (`src/forest/api/handlers/bot-create.normalize.ts`), and handler (`src/forest/api/handlers/bot-create.ts`).
- Update `/bots` list filter to include `live_running`, remove dead filter icon, and use localized strings.
- Remove duplicate `.main-content` wrappers from child pages (`bots/page.tsx`, `bots/new/page.tsx`, `bots/[id]/page.tsx`, `settings/page.tsx`).
- Standardize `.form-input` min-height to 44px (`--target-min-height: 44px`) and consolidate CSS rules in `src/app/globals.css`.
- Synchronize 100% Vietnamese and English localization keys in `vi.json` and `en.json`.

## Acceptance Criteria
- [x] `src/components/layout/sidebar-routes.ts` and updated `src/components/layout/Sidebar.tsx` render 28 routes across 4 groups with `ADR-001 PAPER ONLY` badge in footer; `sidebar.test.tsx` passes with 100% green.
- [x] `src/components/dashboard/dashboard-view-tabs.tsx` and updated `src/components/dashboard/dashboard-client.tsx` support switching between `ALL`, `TRADING`, `TELEMETRY` with roving tabIndex; all existing dashboard tests pass.
- [x] `quantExecution` is fully plumbed from Wizard UI -> POST `/api/bots` -> `normalizeWizardConfig` -> `botCreateHandler`.
- [x] `ReviewStep` renders `VOLATILITY_DCA_FIELDS` for `volatility_dca` bots.
- [x] Duplicate `.main-content` wrappers eliminated from all child dashboard pages.
- [x] Status filter on `/bots` includes `live_running` and removes dead filter button.
- [x] All modified/created production files in `src/` are `<= 92 LOC`.
- [x] Quality gates pass 100%: `npm test`, `npx vitest run`, `npm run type-check`, `npm run lint`.
