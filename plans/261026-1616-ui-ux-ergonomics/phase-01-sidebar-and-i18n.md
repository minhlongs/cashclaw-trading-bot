# Phase 1 — Pillar 1: Sidebar 4-Group IA, ADR-001 Badge & Localization

## Context
- `src/components/layout/Sidebar.tsx` currently renders 26 flat routes, omitting `/billing` and `/strategies/volatility-dca`, and displays static `t('common.loading')` in the footer.
- `src/components/layout/sidebar.test.tsx` calls `screen.getByRole('button')` with no filter, requiring that only 1 `<button>` exists in `Sidebar`.
- All production files in `src/` must remain `<= 92 LOC`.

## Files Owned
- `src/components/layout/sidebar-routes.ts` (New)
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/sidebar.test.tsx`
- `src/messages/en.json`
- `src/messages/vi.json`

## Implementation Steps
1. Add missing navigation keys (`nav.billing`, `nav.strategies/volatility-dca`, `nav.groups.*`, `nav.paperOnlyBadge`, `nav.expandSidebar`, `nav.collapseSidebar`), dashboard view tab keys (`dashboard.viewMode.*`), and bot wizard keys (`botWizard.fields.quantExecution`, `botWizard.fields.quantExecutionDesc`, `botWizard.enabled`, `botWizard.disabled`, `bots.filterAll`) to `src/messages/en.json` and `src/messages/vi.json`.
2. Create `src/components/layout/sidebar-routes.ts` exporting `NAV_GROUPS` (4 groups, 28 routes total) and `NAV_ROUTES` flat list.
3. Update `src/components/layout/Sidebar.tsx` (`<= 85 LOC`) to render grouped navigation with `<div className="sidebar-group-label" role="presentation">` when expanded, `aria-current={isActive ? 'page' : undefined}`, and the `ADR-001 PAPER ONLY` badge in `.sidebar-footer`.
4. Update `src/components/layout/sidebar.test.tsx` to verify all 28 routes, group labels, and `ADR-001 PAPER ONLY` badge.
