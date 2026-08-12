---
phase: 4
title: "Dashboard UI — 5 Pages + i18n"
status: in-progress
priority: P2
effort: 3d
dependencies: [phase-01, phase-03]
---

# Phase 4: Dashboard UI

## Overview
Build all 5 trading dashboard pages per wireframes + design guidelines. Bilingual VN+EN. Server components for data, client components for interactivity.

## Pages
1. **Login** (`/login`) — Simple email + password (or magic link for internal use)
2. **Dashboard** (`/dashboard`) — Portfolio overview, KPIs, recent trades, quick actions
3. **Bot Management** (`/bots`) — List, create, filter bots. Status badges.
4. **Bot Detail** (`/bots/[id]`) — Chart, grid visualization, trade history, config editor
5. **Settings** (`/settings`) — Exchange credentials, risk limits, language toggle

## Design System
- Brand: CashClaw Algo Trader
- Tokens: `@/lib/styles/tokens.css` (CSS custom properties from design-guidelines.md)
- Components: shadcn/ui with custom theme (dark terminal)
- Charts: lightweight-charts (TradingView) for candlestick + grid overlay
- Tables: TanStack Table (sort, filter, pagination)
- Bilingual: next-intl `useTranslations()` in every client component

## Component Tree
```
src/components/
  trading/
    PortfolioCard.tsx          # Total balance + today P&L
    BotStatusBadge.tsx         # Green/amber/red/gray status
    TradeTable.tsx             # Recent trades with sort
    CreateBotWizard.tsx        # 3-step: strategy → pair → params
    GridVisualizer.tsx         # Horizontal grid lines on price chart
    BBChart.tsx                # Bollinger Bands overlay
    DrawdownGauge.tsx          # Risk indicator
    KillSwitchButton.tsx       # Red emergency stop
  ui/                          # shadcn/ui themed
    button.tsx, card.tsx, table.tsx, ...
```

## i18n Strings
```
src/messages/
  vi.json   # Vietnamese translations
  en.json   # English translations
```

Key bilingual labels:
- "Tổng tài sản / Portfolio Value"
- "Lãi/Lỗ hôm nay / Today's P&L"
- "Bot hoạt động / Active Bots"
- "Tạo bot mới / New Bot"
- "Dừng khẩn cấp / Emergency Stop"

## Implementation Steps
1. Set up shadcn/ui with custom dark theme (CSS tokens from design-guidelines.md).
2. Build shared trading components (Badge, PortfolioCard, TradeTable).
3. Page 1 — Login: wireframe-accurate, magic link auth.
4. Page 2 — Dashboard: KPI grid + trade table + quick actions.
5. Page 3 — Bot Management: list + create wizard + filter.
6. Page 4 — Bot Detail: TradingView chart + grid/BV overlay + config panel.
7. Page 5 — Settings: exchange credentials form + risk limits + locale toggle.
8. Wire all pages to D1 via Server Actions.

## Server Actions (data mutations)
```typescript
// src/actions/bots.ts
export async function createBot(input: CreateBotInput) { ... }
export async function updateBot(id: string, config: Partial<BotConfig>) { ... }
export async function pauseBot(id: string) { ... }
export async function emergencyStop() { ... }
```

## Progress

### Completed in this session
- **Dashboard page** (`/dashboard`) — Server Component + Client Component, KPI grid, bot table, quick actions sidebar
- **Bot Management list** (`/bots`) — Filter + search UI, status badges, locale-aware routing
- **Bot Wizard** (`/bots/new`) — 4-step flow (basic → strategy → config → review), controlled inputs, strategy-specific params
- **Bot Detail** (`/bots/[id]`) — KPI cards, overview/trades/config tabs, locale-aware back-links
- **Bug fixes**: locale hardcoding (useLocale), uncontrolled wizard inputs → controlled, BotCardData shape expanded
- **Settings page** (`/settings`) — Server Component + Client Component, exchange credentials with masked keys, risk limits form, killswitch status display

### Still TODO
- [ ] Wire bots-list/bot-detail to real server data (currently mock data)
- [ ] shadcn/ui themed component library
- [ ] lightweight-charts on Bot Detail page
- [x] Sortable trade table — lightweight SortableTable component (no TanStack dep needed, npm install broken by @cloudflare/nextjs 404)

## Success Criteria
- [x] Dashboard renders with KPI grid + bot table + quick actions
- [x] All locale links use `useLocale()` (no hardcoded `/vi/`)
- [x] Bot wizard Step 3 config uses controlled inputs wired to form state
- [x] BotCardData shape unified across dashboard and bot list
- [x] All 5 pages render per wireframes (layout matches design)
- [x] VN/EN labels via `useTranslations()` with fallback defaults
- [x] Sortable trades table with 3-state sort (asc/desc/none), no extra dependency
- [x] Dashboard loads bot data from D1 (blocked on Phase 03 D1 schema + BotManager D1 adapter)
- [x] Create Bot wizard produces valid bot config stored in D1 (blocked on Phase 03)
- [ ] Responsive: mobile layout (basic responsive exists; full bottom nav deferred)

## Risk Assessment
- **Risk:** lightweight-charts bundle size > 200KB. **Mitigation:** Dynamic import (`next/dynamic`), load only on Bot Detail page.
- **Risk:** Vietnamese text overflow in tables. **Mitigation:** Allow 1.2× English width, use `truncate` with tooltip.
